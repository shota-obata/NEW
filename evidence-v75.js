;(() => {
  "use strict";
  if (window.__growthEvidenceV75 || !window.GrowthTeamCore) return;
  window.__growthEvidenceV75 = true;

  const Core = window.GrowthTeamCore;
  const commit = () => window.GrowthTeam?.commitState
    ? window.GrowthTeam.commitState()
    : save();
  const list = value => Array.isArray(value) ? value : [];
  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));

  function ensurePage() {
    let page = document.getElementById("evidence");
    if (!page) {
      page = document.createElement("section");
      page.id = "evidence";
      page.className = `page ${state.page === "evidence" ? "active" : ""}`;
      document.querySelector(".shell > main")?.appendChild(page);
    }
    return page;
  }

  function ensureNavigation() {
    const side = document.getElementById("side");
    if (side && !side.querySelector('[data-page="evidence"]')) {
      const button = document.createElement("button");
      button.className = `nav ${state.page === "evidence" ? "active" : ""}`;
      button.dataset.page = "evidence";
      button.textContent = "Evidence";
      const library = side.querySelector('[data-page="library"]');
      side.insertBefore(button, library || side.querySelector('[data-page="settings"]'));
    }
    const mobileMenu = document.querySelector(".v60-mobile-panel");
    if (mobileMenu && !mobileMenu.querySelector('[data-page="evidence"]')) {
      const button = document.createElement("button");
      button.dataset.page = "evidence";
      button.dataset.v60Action = "close-mobile-menu";
      button.textContent = "Evidence";
      mobileMenu.prepend(button);
    }
  }

  function normalizeTerminology() {
    document.querySelectorAll('[data-page="issue"]').forEach(button => {
      if (button.matches("button, a")) button.textContent = "今回の問い";
    });
    const questionLabel = document.getElementById("cpIssue")?.closest(".field")?.querySelector("label");
    if (questionLabel) questionLabel.textContent = "Checkpointの問い候補";
    const issueEyebrow = document.querySelector("#issue .eyebrow");
    if (issueEyebrow && /ISSUE A/i.test(issueEyebrow.textContent || "")) {
      issueEyebrow.textContent = "CURRENT QUESTION";
    }
    document.querySelectorAll("#planner .lead, #planner .calendar-right p").forEach(node => {
      node.textContent = (node.textContent || "")
        .replaceAll("Issue A", "今回の問い")
        .replaceAll("検証テーマ", "検証条件");
    });
  }

  function checkpointFor(id) {
    return list(state.journey?.checkpoints).find(item => item.id === id) || null;
  }

  function updateForEvidence(id) {
    return list(state.journeyUpdates).find(item => item.evidenceId === id && item.status === "pending") ||
      list(state.journeyUpdates).find(item => item.evidenceId === id) ||
      null;
  }

  function statusLabel(record) {
    const status = record.journeyImpact?.status || "pending";
    return status === "applied" ? "Journey反映済み" :
      status === "rejected" ? "反映しない" : "判断待ち";
  }

  function evidenceCard(record) {
    const checkpoint = checkpointFor(record.checkpointId);
    const update = updateForEvidence(record.id);
    const pending = (record.journeyImpact?.status || "pending") === "pending";
    const canDecide = state.role === "staff" && pending;
    return `
      <article class="e75-card ${pending ? "pending" : ""}">
        <header class="e75-cardhead">
          <div>
            <div class="eyebrow">${safe(checkpoint ? `${checkpoint.code} ${checkpoint.title}` : "CHECKPOINT未接続")}</div>
            <h2>${safe(record.title)}</h2>
            <small>${safe(record.modelId ? `Model ${record.modelId}` : record.sourceType)} · ${safe(record.createdAt)}</small>
          </div>
          <span class="e75-status ${safe(record.journeyImpact?.status || "pending")}">${safe(statusLabel(record))}</span>
        </header>
        <div class="e75-logic">
          <section><span>FACT｜何が起きたか</span><p>${safe(record.fact || "未記入")}</p></section>
          <section><span>JUDGMENT｜何が分かったか</span><p>${safe(record.judgment || "未記入")}</p></section>
          <section><span>WHY SO?｜なぜそう言えるか</span>${record.whySo.length ? `<ul class="e75-reasons">${record.whySo.map(reason => `<li>${safe(reason)}</li>`).join("")}</ul>` : "<p>根拠がまだ接続されていません。</p>"}</section>
          <section><span>SO WHAT?｜次に何を変えるか</span><p>${safe(record.soWhat || record.nextTest || "未記入")}</p></section>
        </div>
        ${update?.proposedQuestion ? `<div class="e75-update"><span>次の問い候補</span><b>${safe(update.proposedQuestion)}</b></div>` : ""}
        ${canDecide ? `
          <div class="e75-actions">
            <button class="btn secondary" data-e75-action="reinforce" data-id="${safe(record.id)}">現在地を補強する</button>
            ${update?.proposedQuestion ? `<button class="btn primary" data-e75-action="question" data-id="${safe(record.id)}">次の問いへ更新</button>` : ""}
            <button class="btn secondary" data-e75-action="hold" data-id="${safe(record.id)}">今回は反映しない</button>
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderEvidence() {
    const root = ensurePage();
    if (state.page !== "evidence") return;
    const records = list(state.evidenceRecords).slice().sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );
    const pending = records.filter(record => (record.journeyImpact?.status || "pending") === "pending").length;
    const applied = records.filter(record => record.journeyImpact?.status === "applied").length;
    root.innerHTML = `
      <header class="e75-head">
        <div><div class="eyebrow">EVIDENCE / JOURNEY UPDATE</div><h1>経験を、現在地を変える根拠へ。</h1><p class="lead">Practiceの事実を確認し、Journeyへ反映するかを一件ずつ判断します。</p></div>
        <button class="btn primary" data-page="practice">Practiceを記録</button>
      </header>
      <section class="e75-summary">
        <article><span>ALL EVIDENCE</span><b>${records.length}</b></article>
        <article><span>判断待ち</span><b>${pending}</b></article>
        <article><span>Journey反映済み</span><b>${applied}</b></article>
      </section>
      <section class="e75-list">${records.map(evidenceCard).join("") || `<div class="e75-empty"><b>Evidenceはまだありません。</b><p>Practiceを完了すると、ここでJourneyへの反映を判断できます。</p></div>`}</section>
    `;
  }

  function resolveEvidence(id, action) {
    const record = list(state.evidenceRecords).find(item => item.id === id);
    const update = updateForEvidence(id);
    if (!record || !update || state.role !== "staff") return;
    const checkpoint = checkpointFor(record.checkpointId);
    const at = Core.isoNow();
    const applied = action !== "hold";
    record.journeyImpact = Object.assign({}, record.journeyImpact || {}, {
      status: applied ? "applied" : "rejected",
      note: action === "question" ? "次の問いへ更新" : action === "reinforce" ? "現在地を補強" : "今回は反映しない"
    });
    record.updatedAt = at;
    update.status = applied ? "applied" : "rejected";
    update.impact = action;
    update.resolvedAt = at;
    update.resolvedBy = state.staffId || "Staff";
    if (checkpoint) {
      checkpoint.history = list(checkpoint.history);
      checkpoint.history.push({
        at,
        by: "Staff",
        action: applied ? "EvidenceをJourneyへ反映" : "Evidenceを保留",
        detail: record.title
      });
    }
    state.journey.history = list(state.journey?.history);
    state.journey.history.push({
      at,
      by: "Staff",
      action: applied ? "Journey Update" : "Evidence保留",
      detail: `${checkpoint?.code || ""} ${record.title}`.trim()
    });
    if (applied) {
      const current = Object.assign({}, state.currentQuestion || {});
      const history = list(current.history);
      if (action === "question" && update.proposedQuestion) {
        history.push({
          at,
          from: current.text || "",
          to: update.proposedQuestion,
          evidenceId: record.id
        });
        current.previousText = current.text || "";
        current.text = update.proposedQuestion;
      }
      current.checkpointId = checkpoint?.id || current.checkpointId || "";
      current.evidenceIds = Array.from(new Set([...list(current.evidenceIds), record.id]));
      current.whyNow = record.judgment || current.whyNow || "";
      current.nextTest = record.nextTest || current.nextTest || "";
      current.history = history;
      current.updatedAt = at;
      current.updatedBy = "Staff";
      state.currentQuestion = Core.normalizeCurrentQuestion(current, state, list(state.journey?.checkpoints));
      state.issue = Object.assign({}, state.currentQuestion, { title: state.currentQuestion.text });
    }
    commit();
    render();
  }

  const previousRender = render;
  render = function renderV75Evidence() {
    previousRender();
    ensurePage().classList.toggle("active", state.page === "evidence");
    ensureNavigation();
    normalizeTerminology();
    renderEvidence();
    const versionLabel = `v${window.GROWTH_VERSION || "7.9"}`;
    document.title = `Growth OS ${versionLabel}`;
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = versionLabel;
  };

  document.addEventListener("click", event => {
    if (event.target.closest('[data-v60-action="open-mobile-menu"]')) {
      ensureNavigation();
      normalizeTerminology();
    }
    const button = event.target.closest("[data-e75-action]");
    if (!button) return;
    resolveEvidence(button.dataset.id, button.dataset.e75Action);
  });

  render();
})();
