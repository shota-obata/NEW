;(() => {
  "use strict";
  if (window.__growthManagementV74 || !window.GrowthTeamCore) return;
  window.__growthManagementV74 = true;

  const Core = window.GrowthTeamCore;
  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  const list = value => Array.isArray(value) ? value : [];
  const today = () => new Date().toISOString().slice(0, 10);
  const DAY = 86400000;
  const view = { mode: "all", filter: "all" };

  function daysBetween(a, b = new Date()) {
    const date = a ? new Date(a) : null;
    if (!date || Number.isNaN(date.getTime())) return 0;
    return Math.max(0, Math.floor((b - date) / DAY));
  }

  function daysUntil(value) {
    if (!value) return 0;
    const target = new Date(`${value}T23:59:59`);
    if (Number.isNaN(target.getTime())) return 0;
    return Math.ceil((target - new Date()) / DAY);
  }

  function currentCheckpoint(workspace) {
    const checkpoints = list(workspace?.journey?.checkpoints);
    return checkpoints.find(item => item.status === "current") ||
      checkpoints.find(item => item.status !== "done") ||
      checkpoints[0] || null;
  }

  function countRequirements(checkpoint) {
    const normalized = list(checkpoint?.evidenceRequirements).filter(Boolean);
    if (normalized.length) return normalized.length;
    return String(checkpoint?.evidence || "")
      .split(/\s*\/\s*|\n|、/)
      .filter(item => item.trim()).length || 1;
  }

  function lastActivity(workspace, checkpoint) {
    const candidates = [
      workspace?.meta?.updatedAt,
      workspace?.issue?.updatedAt,
      checkpoint?.updatedAt,
      ...list(checkpoint?.history).map(item => item.at),
      ...list(checkpoint?.evidenceItems).map(item => item.at || item.createdAt),
      ...list(workspace?.practiceSessions).map(item => item.at || item.updatedAt || item.createdAt),
      ...list(workspace?.supportSessions).map(item => item.at || item.updatedAt || item.createdAt)
    ].filter(Boolean).map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()));
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates.map(date => date.getTime())));
  }

  function scopedStaff(payload) {
    const org = payload.organization;
    const manager = org.managementMembers.find(item => item.id === org.activeManagementId);
    const ids = list(manager?.staffIds);
    return org.staffMembers.filter(member =>
      member.status === "active" && (!ids.length || ids.includes(member.id))
    );
  }

  function supportName(payload, member, workspace) {
    const id = member?.primarySupportId || workspace?.primarySupportId;
    return payload.organization.supportMembers.find(item => item.id === id)?.name || "未割当";
  }

  function calculate(payload, member) {
    const workspace = payload.staffWorkspaces[member.id] || {};
    const checkpoint = currentCheckpoint(workspace);
    const checkpoints = list(workspace.journey?.checkpoints);
    const totalHours = checkpoints.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
    const actualHours = checkpoints.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
    const progress = totalHours
      ? Math.min(100, Math.round(actualHours / totalHours * 100))
      : Math.max(0, Math.min(100, Number(workspace.progress) || 0));
    const planned = Math.max(0, Math.min(100, Number(workspace.planned) || 0));
    const gap = progress - planned;
    const daysLeft = daysUntil(workspace.deadline);
    const weeklyHours = Math.max(.1, Number(workspace.hours) || 0);
    const remainingHours = Math.max(0, totalHours - actualHours);
    const capacityHours = Math.max(0, daysLeft / 7 * weeklyHours);
    const capacityGap = Math.round((capacityHours - remainingHours) * 10) / 10;
    const evidenceCount = list(checkpoint?.evidenceItems).length;
    const evidenceRequired = countRequirements(checkpoint);
    const evidenceCoverage = Math.min(100, Math.round(evidenceCount / Math.max(1, evidenceRequired) * 100));
    const practices = list(workspace.practiceSessions);
    const support = list(workspace.supportSessions);
    const supportRatio = practices.length
      ? Math.round(support.length / practices.length * 100)
      : support.length ? 100 : 0;
    const futureModels = list(workspace.modelBookings)
      .filter(item => !item.date || item.date >= today())
      .sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));
    const nextModel = futureModels[0] || null;
    const activity = lastActivity(workspace, checkpoint);
    const issueAge = Number(workspace.issue?.age) || daysBetween(workspace.issue?.updatedAt || activity);
    const stagnationDays = activity ? daysBetween(activity) : issueAge;
    const assets = list(payload.organization.library).filter(asset =>
      list(asset.staffIds).includes(member.id)
    );
    const conversionBase = Math.max(1, practices.length + support.length);
    const libraryRate = Math.min(100, Math.round(assets.length / conversionBase * 100));
    const visualAssets = assets.filter(asset => list(asset.images).length >= 2).length;
    const alerts = [];
    const add = (type, title, detail, action) => alerts.push({ type, title, detail, action });

    if (Number(workspace.overtimeHours) > 0) {
      add("critical", "時間外を前提にしている", `${Number(workspace.overtimeHours)}時間の時間外活動が記録されています。`, "期限・科目・支援方法を再設計する");
    }
    if (workspace.deadline && capacityGap < 0) {
      add("critical", "現在の設計では期限に間に合わない", `勤務時間内の容量が約${Math.abs(Math.round(capacityGap))}時間不足します。`, "Checkpointの範囲か期限を見直す");
    } else if (workspace.deadline && daysLeft < 0) {
      add("critical", "到達期限を超過", "期限後もJourneyが完了していません。", "Vision到達条件と期限を再設定する");
    } else if (gap <= -10) {
      add("warning", "予定地点から遅れている", `計画より${Math.abs(gap)}%後ろです。`, "現在のIssueへ効くPracticeだけに絞る");
    }
    if (stagnationDays >= 14 || issueAge >= 14) {
      add("warning", "同じ問いが停滞", `${Math.max(stagnationDays, issueAge)}日間、現在地の更新が弱い状態です。`, "Issue仮説か検証条件をSupportと見直す");
    }
    if (evidenceCoverage < 100) {
      add("notice", "Evidenceが不足", `Current Checkpointの確認は${evidenceCount}/${evidenceRequired}件です。`, "次のモデルを不足Evidenceへ割り当てる");
    }
    if (!futureModels.length) {
      add("warning", "次のモデルが未設定", "Issueへ答える実践機会が予定されていません。", "Model Plannerへ検証モデルを置く");
    }
    if (practices.length >= 2 && supportRatio >= 75) {
      add("warning", "Support介入が高止まり", `Practiceに対するSupport介入率が${supportRatio}%です。`, "次回はSupport Levelを一段下げる");
    }
    if (conversionBase >= 3 && libraryRate < 25) {
      add("notice", "経験が資産化されていない", `PracticeとSupport ${conversionBase}件に対しLibraryは${assets.length}件です。`, "転用ルールを一件Libraryへ残す");
    }
    if (!alerts.length) {
      add("good", "計画線上", "期限・実践・Evidence・支援が現在のJourneyへ接続しています。", "次の条件転移を準備する");
    }
    const rank = { critical: 4, warning: 3, notice: 2, good: 1 };
    alerts.sort((a, b) => rank[b.type] - rank[a.type]);
    return {
      member, workspace, checkpoint, progress, planned, gap, daysLeft, totalHours,
      actualHours, remainingHours, capacityGap, evidenceCount, evidenceRequired,
      evidenceCoverage, practices, support, supportRatio, nextModel, futureModels,
      issueAge, stagnationDays, assets, libraryRate, visualAssets, alerts,
      primary: alerts[0], supportName: supportName(payload, member, workspace)
    };
  }

  function statusLabel(type) {
    return ({ critical: "CRITICAL", warning: "REVIEW", notice: "NOTICE", good: "ON TRACK" })[type] || "NOTICE";
  }

  function rowMarkup(row) {
    const cp = row.checkpoint;
    return `
      <article class="v74-management-person ${row.primary.type}">
        <div class="v74-management-person-head">
          <div class="v74-manager-avatar">${safe(row.member.initial || row.member.name?.slice(0, 1) || "S")}</div>
          <div><small>STAFF</small><h2>${safe(row.member.name)}</h2><p>${safe(row.supportName)}</p></div>
          <span class="v74-health ${row.primary.type}">${statusLabel(row.primary.type)}</span>
          <div class="v74-manager-ring" style="--p:${row.progress}"><b>${row.progress}%</b></div>
        </div>
        <div class="v74-management-route">
          <span>VISION</span><b>${safe(row.workspace.vision || "未設定")}</b>
          <i>→</i><span>CURRENT</span><b>${safe(cp ? `${cp.code} ${cp.title}` : "未設定")}</b>
        </div>
        <div class="v74-management-alert">
          <i></i><div><small>いま確認する構造</small><b>${safe(row.primary.title)}</b><p>${safe(row.primary.detail)}</p></div>
        </div>
        <dl class="v74-management-facts">
          <div><dt>期限</dt><dd>${row.daysLeft}日</dd><small>${safe(row.workspace.deadline || "未設定")}</small></div>
          <div><dt>Evidence</dt><dd>${row.evidenceCount}/${row.evidenceRequired}</dd><small>${row.evidenceCoverage}% 確認</small></div>
          <div><dt>Support</dt><dd>${row.supportRatio}%</dd><small>${row.support.length}/${row.practices.length} sessions</small></div>
          <div><dt>Library</dt><dd>${row.libraryRate}%</dd><small>${row.visualAssets} visual sets</small></div>
          <div><dt>次のモデル</dt><dd>${safe(row.nextModel?.date || "未設定")}</dd><small>${safe(row.nextModel?.name || "実践機会なし")}</small></div>
        </dl>
        <div class="v74-management-recommend">
          <span>NEXT MANAGEMENT DECISION</span><b>${safe(row.primary.action)}</b>
          <button class="btn primary small" data-v74-management="detail" data-id="${safe(row.member.id)}">構造を見る</button>
        </div>
      </article>
    `;
  }

  function renderAll(root, payload, rows) {
    const filter = view.filter;
    const filtered = rows.filter(row => {
      if (filter === "all") return true;
      if (filter === "risk") return row.primary.type === "critical" || row.primary.type === "warning";
      if (filter === "stalled") return row.stagnationDays >= 14 || row.issueAge >= 14;
      if (filter === "support") return row.supportRatio >= 75;
      if (filter === "library") return row.libraryRate < 25;
      return true;
    });
    const critical = rows.filter(row => row.primary.type === "critical").length;
    const risk = rows.filter(row => row.primary.type === "warning").length;
    const onTrack = rows.filter(row => row.primary.type === "good").length;
    const manager = payload.organization.managementMembers.find(
      item => item.id === payload.organization.activeManagementId
    );
    root.innerHTML = `
      <header class="v74-management-head">
        <div><div class="eyebrow">MANAGEMENT / SYSTEM HEALTH</div><h1>努力量ではなく、<br>止まっている構造を見る。</h1><p class="lead">期限・停滞・介入・資産化をStaff横断で確認し、犬の道になる前にJourneyを修正します。</p></div>
        <button class="btn secondary" data-page="people">People / Team</button>
      </header>
      <section class="v74-management-overview">
        <div class="v74-health-main ${critical ? "critical" : risk ? "warning" : "good"}">
          <span>ORGANIZATION HEALTH</span><b>${critical ? "再設計が必要" : risk ? "確認が必要" : "計画線上"}</b>
          <small>${safe(manager?.name || "Management")}の閲覧範囲・${rows.length}名</small>
        </div>
        <div><span>CRITICAL</span><b>${critical}</b><small>期限・時間外</small></div>
        <div><span>REVIEW</span><b>${risk}</b><small>停滞・支援</small></div>
        <div><span>ON TRACK</span><b>${onTrack}</b><small>計画線上</small></div>
      </section>
      <nav class="v74-management-filters">
        ${[
          ["all", "すべて"], ["risk", "要確認"], ["stalled", "Issue停滞"],
          ["support", "介入過多"], ["library", "資産化停止"]
        ].map(([id, label]) => `<button class="${filter === id ? "active" : ""}" data-v74-management="filter" data-filter="${id}">${label}</button>`).join("")}
      </nav>
      <section class="v74-management-list">
        ${filtered.map(rowMarkup).join("") || `<div class="v74-management-empty"><b>該当するStaffはいません。</b><p>別のフィルターを確認してください。</p></div>`}
      </section>
    `;
  }

  function renderDetail(root, payload, row) {
    const cp = row.checkpoint;
    const audit = list(payload.organization.auditLog)
      .filter(item => item.targetStaffId === row.member.id)
      .slice(0, 10);
    root.innerHTML = `
      <header class="v74-management-head detail">
        <div><div class="eyebrow">MANAGEMENT / STAFF STRUCTURE</div><h1>${safe(row.member.name)}の成長構造。</h1><p class="lead">本人を評価せず、Visionへの到達を止めている仕組みを確認します。</p></div>
        <button class="btn secondary" data-v74-management="all">全体一覧へ</button>
      </header>
      <section class="v74-management-detail-hero ${row.primary.type}">
        <div><span>${statusLabel(row.primary.type)}</span><h2>${safe(row.workspace.vision || "Vision未設定")}</h2><p>${safe(row.workspace.issue?.title || cp?.issue || "今回の問い未設定")}</p></div>
        <div class="v74-manager-ring large" style="--p:${row.progress}"><b>${row.progress}%</b><small>JOURNEY</small></div>
      </section>
      <section class="v74-decision-path">
        <div><span>01 VISION</span><b>${safe(row.workspace.deadline || "期限未設定")}</b><p>${row.daysLeft}日</p></div>
        <i>→</i><div><span>02 CURRENT</span><b>${safe(cp ? `${cp.code} ${cp.title}` : "未設定")}</b><p>${row.actualHours}/${row.totalHours}h</p></div>
        <i>→</i><div><span>03 ISSUE</span><b>${safe(row.workspace.issue?.title || "未設定")}</b><p>${row.issueAge}日</p></div>
        <i>→</i><div><span>04 NEXT</span><b>${safe(row.primary.action)}</b><p>Management判断</p></div>
      </section>
      <div class="v74-management-detail-grid">
        <section class="v74-alert-stack">
          <div class="v74-section-title"><span>STRUCTURE ALERTS</span><h2>どこが止まっているか。</h2></div>
          ${row.alerts.map(alert => `<article class="${alert.type}"><i></i><div><span>${statusLabel(alert.type)}</span><h3>${safe(alert.title)}</h3><p>${safe(alert.detail)}</p><b>${safe(alert.action)}</b></div></article>`).join("")}
        </section>
        <aside>
          <section class="v74-management-panel">
            <span>CURRENT CHECKPOINT</span><h2>${safe(cp ? `${cp.code} ${cp.title}` : "未設定")}</h2>
            <p>${safe(cp?.criteria || "到達条件未設定")}</p>
            <dl>
              <div><dt>Evidence</dt><dd>${row.evidenceCount}/${row.evidenceRequired}</dd></div>
              <div><dt>Support</dt><dd>${row.supportRatio}%</dd></div>
              <div><dt>Library</dt><dd>${row.assets.length}件</dd></div>
              <div><dt>容量差</dt><dd>${row.capacityGap > 0 ? "+" : ""}${row.capacityGap}h</dd></div>
            </dl>
            <div><button class="btn primary" data-page="journey">Journey</button><button class="btn secondary" data-page="support">Support</button></div>
          </section>
          <section class="v74-management-panel audit">
            <span>AUDIT TRAIL</span><h2>誰が、何を変えたか。</h2>
            ${audit.map(item => `<p><b>${safe(item.actorName)}</b><span>${safe(item.action)}</span><small>${safe(item.at ? new Date(item.at).toLocaleString("ja-JP") : "")}</small></p>`).join("") || "<p>監査履歴はまだありません。</p>"}
          </section>
        </aside>
      </div>
    `;
  }

  function renderManagementV74() {
    const root = document.getElementById("management");
    if (!root || state.page !== "management" || !window.GrowthTeam?.getPayload) return;
    const payload = window.GrowthTeam.getPayload();
    const rows = scopedStaff(payload).map(member => calculate(payload, member));
    if (view.mode === "detail") {
      const activeId = payload.organization.activeStaffId;
      const row = rows.find(item => item.member.id === activeId) || rows[0];
      if (row) renderDetail(root, payload, row);
      else renderAll(root, payload, rows);
    } else {
      renderAll(root, payload, rows);
    }
  }

  const previousRender = render;
  render = function renderV74Management() {
    previousRender();
    renderManagementV74();
    document.title = "Growth OS v7.4";
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = "v7.4";
  };

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-v74-management]");
    if (!button) return;
    const action = button.dataset.v74Management;
    if (action === "filter") {
      view.filter = button.dataset.filter || "all";
      renderManagementV74();
    }
    if (action === "detail") {
      view.mode = "detail";
      window.GrowthTeam?.switchStaff?.(button.dataset.id, "management");
    }
    if (action === "all") {
      view.mode = "all";
      renderManagementV74();
    }
  });

  render();
})();
