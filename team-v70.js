;(() => {
  "use strict";
  if (window.__growthTeamV70 || !window.GrowthTeamCore) return;
  window.__growthTeamV70 = true;

  const Core = window.GrowthTeamCore;
  const STORAGE_KEY = "growthOS.organization.v7";
  const ROLLBACK_KEY = "growthOS.organization.v7.rollback";
  const legacySave = save;
  const legacyRender = render;
  const legacyShow = show;
  let payload;
  let applyingWorkspace = false;
  let managementMode = "all";
  let editingMember = null;
  let pendingBeforeAction = null;
  let onboardingContext = null;

  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  const asArray = Core.asArray;
  const clone = Core.clone;
  const stamp = () => new Date().toLocaleString("ja-JP", { hour12: false });
  const isoNow = Core.isoNow;

  function readPayload() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (stored?.organization) return Core.normalizeOrganizationPayload(stored, state);
    } catch (_) {
      // A malformed v7 snapshot must not hide the valid v6 state.
    }
    return Core.migrateLegacy(state, {
      sourceKey: window.__growthHadStoredState ? "growthOS.unified.v5" : "v6-runtime",
      staffName: state.staffName || state.profile?.name || "黒坂"
    });
  }

  function organization() {
    return payload.organization;
  }

  function memberList(role) {
    if (role === "staff") return organization().staffMembers;
    if (role === "support") return organization().supportMembers;
    return organization().managementMembers;
  }

  function activeMember(role = state.role) {
    const org = organization();
    const id = role === "staff"
      ? org.activeStaffId
      : role === "support"
        ? org.activeSupportId
        : org.activeManagementId;
    return memberList(role).find(member => member.id === id) || memberList(role)[0] || null;
  }

  function activeStaff() {
    return organization().staffMembers.find(member => member.id === organization().activeStaffId) ||
      organization().staffMembers[0] ||
      null;
  }

  function activeWorkspace() {
    return payload.staffWorkspaces[organization().activeStaffId] || null;
  }

  function activePage(role = state.role) {
    const pages = organization().ui?.pages || {};
    return pages[role] || (
      role === "staff" ? "home" :
      role === "support" ? "support" : "management"
    );
  }

  function actorContext() {
    const actor = activeMember(state.role);
    return {
      actorId: actor?.id || "",
      actorName: actor?.name || (
        state.role === "support" ? "Support" :
        state.role === "management" ? "Management" : "Staff"
      ),
      actorRole: state.role,
      staffId: organization().activeStaffId
    };
  }

  function actorName() {
    return actorContext().actorName;
  }

  function audit(action, detail, options = {}) {
    const context = actorContext();
    organization().auditLog.unshift({
      id: Core.uid("audit", `${Date.now()}-${Math.random()}`),
      at: isoNow(),
      actorId: context.actorId,
      actorName: context.actorName,
      actorRole: context.actorRole,
      targetStaffId: options.staffId || organization().activeStaffId || "",
      action,
      detail: detail || ""
    });
    organization().auditLog = organization().auditLog.slice(0, 1000);
  }

  function normalizeWorkspaceRecords(workspace) {
    if (!workspace) return;
    workspace.visionProfile = Core.normalizeVisionProfile(workspace.visionProfile, workspace);
    workspace.onboarding = Object.assign({
      version: 1,
      step: 0,
      visionValue: "",
      avoidVision: "",
      arrivalDefinition: "",
      currentNote: "",
      selfAssessment: {
        technical: 0,
        service: 0,
        human: 0,
        autonomy: 0
      },
      confirmed: {
        vision: false,
        arrival: false,
        time: false,
        current: false,
        issue: false,
        support: false
      },
      completedAt: "",
      updatedAt: ""
    }, workspace.onboarding || {}, {
      selfAssessment: Object.assign({
        technical: 0,
        service: 0,
        human: 0,
        autonomy: 0
      }, workspace.onboarding?.selfAssessment || {}),
      confirmed: Object.assign({
        vision: false,
        arrival: false,
        time: false,
        current: false,
        issue: false,
        support: false
      }, workspace.onboarding?.confirmed || {})
    });
    const staffId = workspace.staffId;
    const staff = organization().staffMembers.find(member => member.id === staffId);
    const supportId = workspace.primarySupportId || staff?.primarySupportId ||
      organization().supportMembers[0]?.id || "";
    workspace.supportSessions = asArray(workspace.supportSessions).map(session => Object.assign(
      {},
      session,
      {
        staffId: session.staffId || staffId,
        supportId: session.supportId || session.actorId || supportId,
        supportName: session.supportName ||
          organization().supportMembers.find(member => member.id === (session.supportId || session.actorId))?.name ||
          session.actorName ||
          (session.by !== "Support" ? session.by : "") ||
          organization().supportMembers.find(member => member.id === supportId)?.name ||
          "Support",
        by: session.by && session.by !== "Support"
          ? session.by
          : session.supportName ||
            organization().supportMembers.find(member => member.id === (session.supportId || session.actorId))?.name ||
            session.actorName ||
            organization().supportMembers.find(member => member.id === supportId)?.name ||
            "Support"
      }
    ));
    asArray(workspace.practiceSessions).forEach(session => {
      session.staffId = session.staffId || staffId;
    });
    asArray(workspace.modelBookings).forEach(model => {
      model.staffId = model.staffId || staffId;
    });
    asArray(workspace.journey?.checkpoints).forEach(checkpoint => {
      asArray(checkpoint.evidenceItems).forEach(evidence => {
        evidence.staffId = evidence.staffId || staffId;
      });
      asArray(checkpoint.supportHistory).forEach(session => {
        const sessionSupportId = session.supportId || session.actorId || supportId;
        const sessionSupport = organization().supportMembers.find(member => member.id === sessionSupportId);
        session.staffId = session.staffId || staffId;
        session.supportId = sessionSupportId;
        session.supportName = session.supportName ||
          sessionSupport?.name ||
          session.actorName ||
          (session.by !== "Support" ? session.by : "") ||
          "Support";
        if (!session.by || session.by === "Support") session.by = session.supportName;
      });
    });
  }

  function syncAssignments() {
    const org = organization();
    for (const support of org.supportMembers) {
      support.staffIds = org.staffMembers
        .filter(staff => asArray(staff.supportMemberIds).includes(support.id))
        .map(staff => staff.id);
    }
    for (const staff of org.staffMembers) {
      const workspace = payload.staffWorkspaces[staff.id];
      if (!workspace) continue;
      workspace.primarySupportId = staff.primarySupportId || "";
      workspace.supportMemberIds = asArray(staff.supportMemberIds);
    }
  }

  function syncCurrentWorkspace() {
    if (applyingWorkspace || !payload) return;
    const staffId = organization().activeStaffId;
    if (!staffId) return;
    organization().library = asArray(state.library).map((asset, index) =>
      Core.normalizeAsset(asset, index)
    );
    const existing = payload.staffWorkspaces[staffId];
    const workspace = Core.workspaceFromState(state, staffId, existing);
    const staff = organization().staffMembers.find(member => member.id === staffId);
    workspace.primarySupportId = staff?.primarySupportId || existing?.primarySupportId || "";
    workspace.supportMemberIds = asArray(staff?.supportMemberIds || existing?.supportMemberIds);
    workspace.libraryRefs = Array.from(new Set([
      ...asArray(existing?.libraryRefs),
      ...organization().library
        .filter(asset => asArray(asset.staffIds).includes(staffId))
        .map(asset => asset.id)
    ]));
    payload.staffWorkspaces[staffId] = workspace;
    organization().ui = organization().ui || { role: state.role, pages: {} };
    organization().ui.role = state.role;
    organization().ui.pages = organization().ui.pages || {};
    organization().ui.pages[state.role] = state.page;
    organization().updatedAt = isoNow();
  }

  function persistPayload() {
    syncAssignments();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  save = function saveV70() {
    syncCurrentWorkspace();
    persistPayload();
    legacySave();
    updateSavedIndicator();
  };

  function applyActiveWorkspace(staffId, options = {}) {
    const org = organization();
    const target = org.staffMembers.find(member => member.id === staffId && (
      member.status === "active" || options.allowArchived
    ));
    if (!target) return false;
    if (!options.skipSync) syncCurrentWorkspace();
    org.activeStaffId = target.id;
    const workspace = payload.staffWorkspaces[target.id] ||
      Core.createWorkspace(target.id, null, { blank: true });
    payload.staffWorkspaces[target.id] = workspace;
    normalizeWorkspaceRecords(workspace);
    const role = options.role || state.role || org.ui?.role || "staff";
    const page = options.page || activePage(role);
    applyingWorkspace = true;
    state = Core.stateFromWorkspace(workspace, org.library, role, page);
    applyingWorkspace = false;
    persistPayload();
    legacySave();
    return true;
  }

  function switchStaff(staffId, page) {
    if (!applyActiveWorkspace(staffId, { page })) return;
    audit("操作対象Staffを変更", activeStaff()?.name || "", { staffId });
    persistPayload();
    render();
  }

  function updateSavedIndicator() {
    const indicator = document.querySelector(".save");
    if (indicator) indicator.textContent = "● 組織データ保存済み";
  }

  function currentCheckpoint(workspace = state) {
    const checkpoints = asArray(workspace.journey?.checkpoints);
    return checkpoints.find(checkpoint => checkpoint.status === "current") ||
      checkpoints.find(checkpoint => checkpoint.status !== "done") ||
      checkpoints[0] ||
      null;
  }

  function workspaceMetrics(workspace) {
    const checkpoints = asArray(workspace?.journey?.checkpoints);
    const total = checkpoints.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
    const actual = checkpoints.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
    const progress = total
      ? Math.min(100, Math.round(actual / total * 100))
      : Math.max(0, Math.min(100, Number(workspace?.progress) || 0));
    const planned = Math.max(0, Math.min(100, Number(workspace?.planned) || 0));
    const deadline = workspace?.deadline ? new Date(`${workspace.deadline}T23:59:59`) : null;
    const daysLeft = deadline && !Number.isNaN(deadline.getTime())
      ? Math.max(0, Math.ceil((deadline - new Date()) / 86400000))
      : 0;
    const evidence = checkpoints.reduce(
      (sum, checkpoint) => sum + asArray(checkpoint.evidenceItems).length,
      0
    );
    const practices = asArray(workspace?.practiceSessions);
    const support = asArray(workspace?.supportSessions);
    const futureModels = asArray(workspace?.modelBookings)
      .filter(model => !model.date || model.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));
    const remainingHours = Math.max(0, total - actual);
    const weeklyHours = Math.max(.1, Number(workspace?.hours) || 0);
    const forecastDays = Math.ceil(remainingHours / weeklyHours * 7);
    const forecast = new Date(Date.now() + forecastDays * 86400000);
    const onTime = Boolean(deadline) && forecast <= deadline;
    const current = currentCheckpoint(workspace);
    const evidenceMissing = !asArray(current?.evidenceItems).length;
    return {
      total, actual, progress, planned, gap: progress - planned, daysLeft,
      evidence, practices, support, futureModels, forecast, onTime,
      current, evidenceMissing
    };
  }

  function meaningfulText(value, placeholders = []) {
    const text = String(value || "").trim();
    return text.length >= 6 && !placeholders.some(placeholder => text.includes(placeholder));
  }

  function onboardingReadiness(member, workspace) {
    const current = currentCheckpoint(workspace || {});
    const onboarding = workspace?.onboarding || {};
    const confirmed = onboarding.confirmed || {};
    const finalCheckpoint = asArray(workspace?.journey?.checkpoints).slice(-1)[0];
    const checks = [
      {
        id: "vision",
        label: "なりたい美容師像",
        ok: confirmed.vision !== false && meaningfulText(workspace?.vision, ["設定してください"])
      },
      {
        id: "arrival",
        label: "期限時点の到達状態",
        ok: confirmed.arrival !== false && meaningfulText(onboarding.arrivalDefinition || finalCheckpoint?.criteria, ["未設定"])
      },
      {
        id: "time",
        label: "期限・勤務時間",
        ok: confirmed.time !== false && Boolean(workspace?.deadline) && Number(workspace?.hours) > 0 && Number(workspace?.overtimeHours || 0) === 0
      },
      {
        id: "current",
        label: "現在地",
        ok: confirmed.current !== false && Boolean(current?.id && current?.title)
      },
      {
        id: "issue",
        label: "今回の問い",
        ok: confirmed.issue !== false && meaningfulText(workspace?.issue?.title || current?.issue, [
          "もっとも答える必要がある問いを設定する",
          "設定してください"
        ])
      },
      {
        id: "support",
        label: "Primary Support",
        ok: confirmed.support !== false && Boolean(member?.primarySupportId || workspace?.primarySupportId)
      },
      {
        id: "model",
        label: "最初のモデル予定",
        ok: asArray(workspace?.modelBookings).some(model => Boolean(model.date))
      }
    ];
    const completed = checks.filter(item => item.ok).length;
    const setupReady = checks.slice(0, 6).every(item => item.ok);
    const operationReady = checks.every(item => item.ok);
    return {
      checks,
      completed,
      total: checks.length,
      percent: Math.round(completed / checks.length * 100),
      missing: checks.filter(item => !item.ok),
      setupReady,
      operationReady
    };
  }

  function updateOnboardingStatus(workspace = state, member = activeStaff()) {
    if (!workspace) return onboardingReadiness(member, workspace);
    workspace.onboarding = workspace.onboarding || {};
    const readiness = onboardingReadiness(member, workspace);
    workspace.meta = workspace.meta || {};
    workspace.meta.onboardingComplete = readiness.setupReady;
    workspace.onboarding.updatedAt = isoNow();
    if (readiness.setupReady && !workspace.onboarding.completedAt) {
      workspace.onboarding.completedAt = isoNow();
    }
    return readiness;
  }

  function renderAvatar(member, className = "") {
    if (member?.avatar) {
      return `<span class="v7-avatar ${className}"><img src="${safe(member.avatar)}" alt=""></span>`;
    }
    return `<span class="v7-avatar ${className}">${safe(member?.initial || "?")}</span>`;
  }

  function personOptions(role, selectedId, includeArchived = false) {
    return memberList(role)
      .filter(member => includeArchived || member.status === "active")
      .map(member => `<option value="${safe(member.id)}" ${member.id === selectedId ? "selected" : ""}>${safe(member.name)}${member.status === "archived" ? "（アーカイブ）" : ""}</option>`)
      .join("");
  }

  function ensureOnboardingModal() {
    if (document.getElementById("v71Onboarding")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="v71-onboarding hidden" id="v71Onboarding" role="dialog" aria-modal="true" aria-labelledby="v71OnboardingTitle">
        <div class="v71-onboarding-shell">
          <aside class="v71-onboarding-side">
            <div>
              <span class="v71-onboarding-brand">Growth OS</span>
              <h2>未来から、今を決める。</h2>
              <p>Visionと期限から逆算し、最初のJourneyと今回の問いを設計します。</p>
            </div>
            <ol id="v71OnboardingSteps"></ol>
            <button class="v71-onboarding-exit" data-v7-action="close-onboarding">あとで続ける</button>
          </aside>
          <main class="v71-onboarding-main">
            <div class="v71-onboarding-top">
              <span id="v71OnboardingProgress">1 / 5</span>
              <button class="close" data-v7-action="close-onboarding" aria-label="閉じる">×</button>
            </div>
            <div id="v71OnboardingContent"></div>
            <div class="v71-onboarding-actions">
              <button class="btn secondary" id="v71OnboardingBack" data-v7-action="onboarding-back">戻る</button>
              <button class="btn primary" id="v71OnboardingNext" data-v7-action="onboarding-next">次へ</button>
            </div>
          </main>
        </div>
      </div>
    `);
  }

  function assessmentOptions(selected) {
    return Array.from({ length: 7 }, (_, index) => {
      const value = index + 1;
      return `<option value="${value}" ${Number(selected || 3) === value ? "selected" : ""}>${value} / 7</option>`;
    }).join("");
  }

  function onboardingStepMarkup(step, member, workspace) {
    const onboarding = workspace.onboarding || {};
    const assessments = onboarding.selfAssessment || {};
    const futureModel = asArray(workspace.modelBookings)
      .slice()
      .sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`))[0];
    const current = currentCheckpoint(workspace);
    if (step === 0) {
      return `
        <div class="v71-question">
          <div class="eyebrow">VISION / 01</div>
          <h1 id="v71OnboardingTitle">どんな美容師になりたい？</h1>
          <p>綺麗な言葉ではなく、誰に・何を・どう届けたいかを本人の言葉で決めます。</p>
        </div>
        <div class="v71-answer">
          <label><span>なりたい美容師像</span><textarea id="v71Vision" placeholder="例：骨格と髪質を読み、顔まわりを安心して任せてもらえる美容師">${safe(workspace.vision === "なりたい美容師像を設定してください" ? "" : workspace.vision)}</textarea></label>
          <label><span>お客様へ届けたい価値</span><textarea id="v71VisionValue" placeholder="施術後、お客様にどんな変化や感情を持ち帰ってほしい？">${safe(onboarding.visionValue || "")}</textarea></label>
          <label><span>なりたくない美容師像</span><textarea id="v71AvoidVision" placeholder="絶対に避けたい働き方・接客・技術姿勢">${safe(onboarding.avoidVision || "")}</textarea></label>
        </div>
      `;
    }
    if (step === 1) {
      return `
        <div class="v71-question">
          <div class="eyebrow">TARGET / 02</div>
          <h1 id="v71OnboardingTitle">いつまでに、どこまで行く？</h1>
          <p>期限を努力の圧力にせず、何を捨てて何へ集中するかを決める基準にします。</p>
        </div>
        <div class="v71-answer">
          <label><span>到達期限</span><input id="v71Deadline" type="date" value="${safe(workspace.deadline || "")}"></label>
          <label><span>その日に何ができれば「到達」と言える？</span><textarea id="v71Arrival" placeholder="観測できる行動で定義する。例：異なる骨格でも、顔まわりを自力設計し理由を説明できる">${safe(onboarding.arrivalDefinition || "")}</textarea></label>
          <div class="v71-principle"><b>期限は、時間外労働を増やす理由にしない。</b><span>間に合わない時は、Journey・科目・Support・期限を再設計します。</span></div>
        </div>
      `;
    }
    if (step === 2) {
      return `
        <div class="v71-question">
          <div class="eyebrow">TIME / 03</div>
          <h1 id="v71OnboardingTitle">勤務時間内で、何時間使える？</h1>
          <p>時間を努力量ではなく設計上の制約として固定し、犬の道を防ぎます。</p>
        </div>
        <div class="v71-time-answer">
          <label><span>1週間に使える育成時間</span><div><input id="v71Hours" type="number" min=".5" step=".5" value="${Number(workspace.hours) || 0}"><b>時間 / 週</b></div></label>
          <div class="v71-zero"><strong>0h</strong><span>時間外労働<br>Growth OSの固定条件</span></div>
        </div>
        <div class="v71-principle"><b>時間内で成立しない計画は、本人ではなく設計を直す。</b><span>科目を絞る・Checkpointを組み替える・Support方法を変える・期限を見直す。</span></div>
      `;
    }
    if (step === 3) {
      return `
        <div class="v71-question">
          <div class="eyebrow">CURRENT / 04</div>
          <h1 id="v71OnboardingTitle">今、どこにいる？</h1>
          <p>AIが採点せず、本人が現在地を決めます。実践記録とのズレは後から鏡として表示します。</p>
        </div>
        <div class="v71-answer">
          <label><span>今もっとも注力する領域</span><select id="v71Focus">${["技術", "接客", "人間力", "判断力", "自走力"].map(value => `<option ${workspace.focusArea === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label><span>現在地を自分の言葉で</span><textarea id="v71CurrentNote" placeholder="できること、まだ不安定なこと、Supportへ頼っている判断">${safe(onboarding.currentNote || "")}</textarea></label>
          <div class="v71-assessments">
            <label><span>技術</span><select id="v71AssessTechnical">${assessmentOptions(assessments.technical)}</select></label>
            <label><span>接客</span><select id="v71AssessService">${assessmentOptions(assessments.service)}</select></label>
            <label><span>人間力</span><select id="v71AssessHuman">${assessmentOptions(assessments.human)}</select></label>
            <label><span>自走力</span><select id="v71AssessAutonomy">${assessmentOptions(assessments.autonomy)}</select></label>
          </div>
          <small class="v71-scale">1 = まだ分からない　/　4 = モデルで試せる　/　7 = 他者へ教えられる</small>
        </div>
      `;
    }
    return `
      <div class="v71-question">
        <div class="eyebrow">START / 05</div>
        <h1 id="v71OnboardingTitle">最初の問いと、検証日を決める。</h1>
        <p>Issue Aは苦手科目ではなく、次のCheckpointへ進むために今もっとも答える価値が高い問いです。</p>
      </div>
      <div class="v71-answer">
        <label><span>Primary Support</span><select id="v71PrimarySupport"><option value="">選択してください</option>${personOptions("support", member.primarySupportId || workspace.primarySupportId)}</select></label>
        <label><span>今回の問い</span><textarea id="v71Issue" placeholder="例：異なる骨格でも、完成像から顔まわりの基準点を自分で設定できるか">${safe(workspace.issue?.title?.includes("もっとも答える必要がある問いを設定する") ? "" : workspace.issue?.title || current?.issue || "")}</textarea></label>
        <div class="v71-model-start">
          <div><span>最初のモデル予定（あとからでも可）</span><small>予定を先に置くと、問いが実験へ変わります。</small></div>
          <div class="v71-model-fields">
            <input id="v71ModelName" placeholder="モデル名" value="${safe(futureModel?.name || "")}">
            <input id="v71ModelDate" type="date" value="${safe(futureModel?.date || "")}">
            <input id="v71ModelTime" type="time" value="${safe(futureModel?.time || "10:00")}">
            <select id="v71ModelMenu">${["カット", "接客モデル", "カット＋接客", "ウィッグ"].map(value => `<option ${futureModel?.menu === value ? "selected" : ""}>${value}</option>`).join("")}</select>
          </div>
        </div>
      </div>
    `;
  }

  function renderOnboardingStep() {
    if (!onboardingContext) return;
    const member = organization().staffMembers.find(item => item.id === onboardingContext.staffId);
    const workspace = payload.staffWorkspaces[onboardingContext.staffId];
    if (!member || !workspace) return;
    const step = Math.max(0, Math.min(4, onboardingContext.step));
    const labels = ["Vision", "到達点", "時間", "現在地", "開始"];
    document.getElementById("v71OnboardingSteps").innerHTML = labels.map((label, index) => `
      <li class="${index === step ? "active" : ""} ${index < step ? "done" : ""}">
        <i>${index < step ? "✓" : index + 1}</i><span>${label}</span>
      </li>
    `).join("");
    document.getElementById("v71OnboardingProgress").textContent = `${step + 1} / 5　${member.name}`;
    document.getElementById("v71OnboardingContent").innerHTML = onboardingStepMarkup(step, member, workspace);
    document.getElementById("v71OnboardingBack").disabled = step === 0;
    document.getElementById("v71OnboardingNext").textContent = step === 4 ? "Journeyを開始" : "次へ";
  }

  function openOnboarding(staffId, step = 0) {
    const member = organization().staffMembers.find(item => item.id === staffId && item.status === "active");
    if (!member) return;
    if (organization().activeStaffId !== staffId) {
      applyActiveWorkspace(staffId, { role: state.role, page: state.page });
    }
    normalizeWorkspaceRecords(payload.staffWorkspaces[staffId]);
    onboardingContext = { staffId, step: Math.max(0, Math.min(4, Number(step) || 0)) };
    ensureOnboardingModal();
    renderOnboardingStep();
    document.getElementById("v71Onboarding").classList.remove("hidden");
    document.body.classList.add("v71-modal-open");
  }

  function closeOnboarding() {
    document.getElementById("v71Onboarding")?.classList.add("hidden");
    document.body.classList.remove("v71-modal-open");
    onboardingContext = null;
    render();
  }

  function saveOnboardingStep() {
    if (!onboardingContext) return false;
    const workspace = payload.staffWorkspaces[onboardingContext.staffId];
    const member = organization().staffMembers.find(item => item.id === onboardingContext.staffId);
    const step = onboardingContext.step;
    workspace.onboarding = workspace.onboarding || {};
    workspace.onboarding.confirmed = workspace.onboarding.confirmed || {};
    if (step === 0) {
      const vision = document.getElementById("v71Vision").value.trim();
      if (!meaningfulText(vision)) return alert("なりたい美容師像を、もう少し具体的に入力してください。"), false;
      workspace.vision = vision;
      workspace.onboarding.visionValue = document.getElementById("v71VisionValue").value.trim();
      workspace.onboarding.avoidVision = document.getElementById("v71AvoidVision").value.trim();
      workspace.visionProfile = Core.normalizeVisionProfile(Object.assign(
        {},
        workspace.visionProfile || {},
        {
          statement: vision,
          customerValue: workspace.onboarding.visionValue,
          avoidVision: workspace.onboarding.avoidVision,
          updatedAt: isoNow()
        }
      ), workspace);
      workspace.onboarding.confirmed.vision = true;
    }
    if (step === 1) {
      const deadline = document.getElementById("v71Deadline").value;
      const arrival = document.getElementById("v71Arrival").value.trim();
      if (!deadline) return alert("到達期限を設定してください。"), false;
      if (!meaningfulText(arrival)) return alert("期限時点の到達状態を、観測できる行動で入力してください。"), false;
      workspace.deadline = deadline;
      workspace.onboarding.arrivalDefinition = arrival;
      workspace.visionProfile = Core.normalizeVisionProfile(Object.assign(
        {},
        workspace.visionProfile || {},
        { arrivalDefinition: arrival, updatedAt: isoNow() }
      ), workspace);
      workspace.onboarding.confirmed.arrival = true;
      const finalCheckpoint = asArray(workspace.journey?.checkpoints).slice(-1)[0];
      if (finalCheckpoint) finalCheckpoint.date = deadline;
    }
    if (step === 2) {
      const hours = Math.max(0, Number(document.getElementById("v71Hours").value) || 0);
      if (!hours) return alert("勤務時間内で使える時間を入力してください。"), false;
      workspace.hours = hours;
      workspace.overtimeHours = 0;
      workspace.onboarding.confirmed.time = true;
    }
    if (step === 3) {
      const note = document.getElementById("v71CurrentNote").value.trim();
      if (!meaningfulText(note)) return alert("現在地を、自分の言葉でもう少し具体的に入力してください。"), false;
      workspace.focusArea = document.getElementById("v71Focus").value;
      workspace.onboarding.currentNote = note;
      workspace.onboarding.selfAssessment = {
        technical: Number(document.getElementById("v71AssessTechnical").value),
        service: Number(document.getElementById("v71AssessService").value),
        human: Number(document.getElementById("v71AssessHuman").value),
        autonomy: Number(document.getElementById("v71AssessAutonomy").value)
      };
      workspace.onboarding.confirmed.current = true;
    }
    if (step === 4) {
      const supportId = document.getElementById("v71PrimarySupport").value;
      const issue = document.getElementById("v71Issue").value.trim();
      if (!supportId) return alert("Primary Supportを選択してください。"), false;
      if (!meaningfulText(issue)) return alert("今回の問いを、次のモデルで検証できる一問にしてください。"), false;
      member.primarySupportId = supportId;
      member.supportMemberIds = Array.from(new Set([...asArray(member.supportMemberIds), supportId]));
      workspace.primarySupportId = supportId;
      workspace.supportMemberIds = member.supportMemberIds.slice();
      workspace.onboarding.confirmed.support = true;
      workspace.issue = Object.assign({}, workspace.issue || {}, {
        title: issue,
        age: 0,
        updatedAt: isoNow()
      });
      workspace.onboarding.confirmed.issue = true;
      const current = currentCheckpoint(workspace);
      if (current) current.issue = issue;
      const modelName = document.getElementById("v71ModelName").value.trim();
      const modelDate = document.getElementById("v71ModelDate").value;
      if (modelName && modelDate) {
        const matchingModel = asArray(workspace.modelBookings).find(model =>
          model.id === workspace.onboarding.firstModelId ||
          (model.name === modelName && model.date === modelDate)
        );
        const existingId = matchingModel?.id || "";
        const existingIndex = asArray(workspace.modelBookings).findIndex(model => model.id === existingId);
        const model = {
          id: existingId || Core.uid("model", `${member.id}-${Date.now()}`),
          staffId: member.id,
          name: modelName,
          date: modelDate,
          time: document.getElementById("v71ModelTime").value || "10:00",
          duration: 120,
          menu: document.getElementById("v71ModelMenu").value,
          checkpointId: current?.id || "",
          checkpointCode: current?.code || "",
          note: issue,
          updatedAt: isoNow()
        };
        if (existingIndex >= 0) workspace.modelBookings[existingIndex] = model;
        else workspace.modelBookings.push(model);
        workspace.onboarding.firstModelId = model.id;
      }
    }
    workspace.onboarding.step = Math.min(4, step + 1);
    workspace.onboarding.updatedAt = isoNow();
    payload.staffWorkspaces[member.id] = workspace;
    if (member.id === organization().activeStaffId) {
      state = Core.stateFromWorkspace(workspace, organization().library, state.role, state.page);
    }
    updateOnboardingStatus(workspace, member);
    syncAssignments();
    persistPayload();
    legacySave();
    return true;
  }

  function moveOnboarding(direction) {
    if (!onboardingContext) return;
    if (direction > 0 && !saveOnboardingStep()) return;
    if (direction < 0) {
      onboardingContext.step = Math.max(0, onboardingContext.step - 1);
      renderOnboardingStep();
      return;
    }
    if (onboardingContext.step < 4) {
      onboardingContext.step += 1;
      renderOnboardingStep();
      return;
    }
    const member = organization().staffMembers.find(item => item.id === onboardingContext.staffId);
    const workspace = payload.staffWorkspaces[onboardingContext.staffId];
    const readiness = updateOnboardingStatus(workspace, member);
    audit("Staff初期設定を完了", `${member.name}: ${readiness.completed}/${readiness.total}`, {
      staffId: member.id
    });
    persistPayload();
    document.getElementById("v71Onboarding").classList.add("hidden");
    document.body.classList.remove("v71-modal-open");
    onboardingContext = null;
    state.page = "home";
    organization().ui.pages[state.role] = "home";
    save();
    render();
  }

  function scopedStaffMembers(role = state.role) {
    const active = organization().staffMembers.filter(member => member.status === "active");
    if (role === "staff") return active;
    const actor = activeMember(role);
    const scopedIds = asArray(actor?.staffIds);
    return scopedIds.length ? active.filter(member => scopedIds.includes(member.id)) : active;
  }

  function scopedStaffOptions(role, selectedId) {
    return scopedStaffMembers(role)
      .map(member => `<option value="${safe(member.id)}" ${member.id === selectedId ? "selected" : ""}>${safe(member.name)}</option>`)
      .join("");
  }

  function ensureScopedTarget(role = state.role) {
    if (role === "staff") return false;
    const scoped = scopedStaffMembers(role);
    if (!scoped.length || scoped.some(member => member.id === organization().activeStaffId)) return false;
    syncCurrentWorkspace();
    organization().activeStaffId = scoped[0].id;
    // The outgoing workspace was synced above. Syncing again after activeStaffId
    // changes would write the old Staff state into the new Staff workspace.
    applyActiveWorkspace(scoped[0].id, { role, page: state.page, skipSync: true });
    return true;
  }

  function ensurePeoplePage() {
    let root = document.getElementById("people");
    if (!root) {
      root = document.createElement("section");
      root.id = "people";
      root.className = "page";
      document.querySelector(".shell > main")?.appendChild(root);
    }
    return root;
  }

  function enhanceNavigation() {
    const sideRoot = document.getElementById("side");
    if (sideRoot && !sideRoot.querySelector('[data-page="people"]')) {
      const label = document.createElement("div");
      label.className = "label v7-team-label";
      label.textContent = "ORGANIZATION";
      const button = document.createElement("button");
      button.className = `nav ${state.page === "people" ? "active" : ""}`;
      button.dataset.page = "people";
      button.textContent = "People / Team";
      const settingsButton = sideRoot.querySelector('[data-page="settings"]');
      sideRoot.insertBefore(label, settingsButton || null);
      sideRoot.insertBefore(button, settingsButton || null);
    }
  }

  function renderSwitcher() {
    const top = document.querySelector(".top");
    if (!top) return;
    let bar = top.querySelector(".v7-personbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "v7-personbar";
      const roles = top.querySelector(".roles");
      top.insertBefore(bar, roles || null);
    }
    const role = state.role;
    const actor = activeMember(role);
    const staff = activeStaff();
    const actorSelect = personOptions(role, actor?.id);
    const targetVisible = role !== "staff";
    bar.innerHTML = `
      <div class="v7-personcell">
        ${renderAvatar(actor)}
        <label><span>${role === "staff" ? "STAFF" : role === "support" ? "SUPPORT" : "MANAGEMENT"}</span>
          <select id="v7ActorSelect">${actorSelect}</select>
        </label>
      </div>
      ${targetVisible ? `
        <span class="v7-personarrow">→</span>
        <div class="v7-personcell v7-target">
          ${renderAvatar(staff, "target")}
          <label><span>対象STAFF</span>
            <select id="v7TargetStaffSelect">${scopedStaffOptions(role, staff?.id)}</select>
          </label>
        </div>
      ` : ""}
    `;
  }

  function renderSupportContext() {
    if (state.page !== "support") return;
    const root = document.getElementById("support");
    const staff = activeStaff();
    const support = activeMember("support");
    if (!root || !staff || !support) return;
    const head = root.querySelector(".support58-head, .head");
    if (!head || root.querySelector(".v7-support-context")) return;
    const context = document.createElement("section");
    context.className = "v7-support-context";
    context.innerHTML = `
      <div>${renderAvatar(support)}<span><small>判断を修正するSupport</small><b>${safe(support.name)}</b></span></div>
      <i>→</i>
      <div>${renderAvatar(staff)}<span><small>対象Staff</small><b>${safe(staff.name)}</b></span></div>
      <p>記録にはSupport実行者と対象Staffを自動保存します。</p>
    `;
    head.after(context);
  }

  function renderOnboardingBanner() {
    if (state.page !== "home") return;
    const root = document.getElementById("home");
    const member = activeStaff();
    const workspace = activeWorkspace();
    if (!root || !member || !workspace) return;
    const readiness = updateOnboardingStatus(workspace, member);
    root.querySelector(".v71-ready-banner")?.remove();
    if (readiness.operationReady) return;
    const banner = document.createElement("section");
    banner.className = `v71-ready-banner ${readiness.setupReady ? "startable" : ""}`;
    const missing = readiness.missing.slice(0, 3).map(item => `<span>${safe(item.label)}</span>`).join("");
    banner.innerHTML = `
      <div class="v71-ready-ring" style="--p:${readiness.percent}"><b>${readiness.percent}%</b></div>
      <div>
        <small>${readiness.setupReady ? "READY TO PRACTICE" : "GROWTH SETUP"}</small>
        <h2>${readiness.setupReady ? "最初のモデルを置けば、運用を始められます。" : "Visionから最初の問いまでを設計します。"}</h2>
        <div class="v71-missing">${missing}</div>
      </div>
      <button class="btn primary" data-v7-action="open-onboarding" data-id="${safe(member.id)}">${readiness.setupReady ? "開始準備を完成" : "初期設定を続ける"}</button>
    `;
    root.prepend(banner);
  }

  function renderIssueV70() {
    const root = document.getElementById("issue");
    if (!root || state.page !== "issue") return;
    const staff = activeStaff();
    const checkpoint = currentCheckpoint();
    const evidenceCount = asArray(checkpoint?.evidenceItems).length;
    const successConditions = asArray(state.issue?.successConditions);
    const conditions = successConditions.length ? successConditions : [
      checkpoint?.criteria || "到達条件をCheckpointで設定する",
      checkpoint?.evidence || "必要EvidenceをCheckpointで設定する",
      "Supportの答えに依存せず、別条件でも判断を再現できる"
    ];
    root.innerHTML = `
      <div class="v7-pagehead">
        <div><div class="eyebrow">ISSUE A / 今回の問い</div><h1>今、答える価値が最も高い問い。</h1><p class="lead">Visionと期限から逆算し、次のモデルで検証できる一問に絞ります。</p></div>
        <button class="btn secondary" data-page="journey">Journeyで位置を確認</button>
      </div>
      <section class="v7-issue-main">
        <div class="v7-issue-path">
          <span>VISION</span><b>${safe(state.vision)}</b><i>→</i>
          <span>CURRENT</span><b>${safe(checkpoint ? `${checkpoint.code} ${checkpoint.title}` : "未設定")}</b><i>→</i>
          <span>QUESTION</span>
        </div>
        <h2>${safe(state.issue?.title || checkpoint?.issue || "今回の問いを設定してください")}</h2>
        <p>不足を評価するためではなく、${safe(staff?.name || "Staff")}が次のCheckpointへ進むための検証軸です。</p>
      </section>
      <div class="v7-issue-grid">
        <section class="card"><div class="title">WHY NOW</div><h3>期限と現在地のズレを、次の経験で小さくする。</h3><dl class="v7-definition"><dt>Checkpoint</dt><dd>${safe(checkpoint?.criteria || "未設定")}</dd><dt>期限</dt><dd>${safe(checkpoint?.date || state.deadline || "未設定")}</dd><dt>Evidence</dt><dd>${evidenceCount}件</dd></dl></section>
        <section class="card"><div class="title">今回の成功条件</div><h3>どこまで答えが出れば前進か。</h3><ul class="v7-checklist">${conditions.map(condition => `<li><i></i>${safe(condition)}</li>`).join("")}</ul></section>
      </div>
      <div class="v7-actiondock"><button class="btn primary" data-page="practice">モデルで検証する</button><button class="btn secondary" data-page="support">Supportで問いを磨く</button></div>
    `;
  }

  function supportName(staffMember, workspace) {
    const supportId = staffMember?.primarySupportId || workspace?.primarySupportId;
    return organization().supportMembers.find(member => member.id === supportId)?.name || "未割当";
  }

  function staffCard(member, options = {}) {
    const workspace = payload.staffWorkspaces[member.id];
    const metrics = workspaceMetrics(workspace);
    const readiness = onboardingReadiness(member, workspace);
    const checkpoint = metrics.current;
    const nextModel = metrics.futureModels[0];
    const active = member.id === organization().activeStaffId;
    return `
      <article class="v7-staffcard ${active ? "active" : ""} ${member.status === "archived" ? "archived" : ""}">
        <div class="v7-staffcard-head">
          <div>${renderAvatar(member, "large")}<span><small>${member.status === "archived" ? "ARCHIVED" : "STAFF"}</small><h3>${safe(member.name)}</h3></span></div>
          <span class="v7-progressbadge">${metrics.progress}%</span>
        </div>
        <div class="progress"><span style="width:${metrics.progress}%"></span></div>
        <div class="v71-readiness ${readiness.operationReady ? "ready" : readiness.setupReady ? "startable" : ""}">
          <span><b>${readiness.percent}%</b> 運用準備</span>
          <small>${readiness.operationReady ? "運用準備完了" : `${readiness.missing[0]?.label || "設定"}を確認`}</small>
        </div>
        <dl class="v7-stafffacts">
          <div><dt>現在地</dt><dd>${safe(checkpoint ? `${checkpoint.code} ${checkpoint.title}` : "未設定")}</dd></div>
          <div><dt>期限</dt><dd>${safe(workspace?.deadline || "未設定")} / ${metrics.daysLeft}日</dd></div>
          <div class="wide"><dt>今回の問い</dt><dd>${safe(workspace?.issue?.title || "未設定")}</dd></div>
          <div><dt>次のモデル</dt><dd>${safe(nextModel ? `${nextModel.date || ""} ${nextModel.name || "モデル"}` : "未設定")}</dd></div>
          <div><dt>Evidence</dt><dd class="${metrics.evidenceMissing ? "warn" : ""}">${metrics.evidenceMissing ? "不足" : `${metrics.evidence}件`}</dd></div>
          <div><dt>Primary Support</dt><dd>${safe(supportName(member, workspace))}</dd></div>
        </dl>
        <div class="v7-cardactions">
          ${member.status === "active" ? `<button class="btn primary small" data-v7-action="select-staff" data-id="${safe(member.id)}">${options.management ? "個人詳細" : "このStaffを開く"}</button>` : ""}
          ${member.status === "active" && (state.role === "management" || member.id === organization().activeStaffId) ? `<button class="btn secondary small" data-v7-action="open-onboarding" data-id="${safe(member.id)}">${readiness.operationReady ? "初期設定を確認" : "初期設定を続ける"}</button>` : ""}
          ${options.canEdit ? `<button class="btn secondary small" data-v7-action="edit-member" data-member-role="staff" data-id="${safe(member.id)}">編集</button>` : ""}
        </div>
      </article>
    `;
  }

  function roleMemberCard(member, options = {}) {
    const assigned = asArray(member.staffIds)
      .map(staffId => organization().staffMembers.find(staff => staff.id === staffId)?.name)
      .filter(Boolean);
    return `
      <article class="v7-membercard ${member.status === "archived" ? "archived" : ""}">
        <div>${renderAvatar(member, "large")}<span><small>${safe(member.role.toUpperCase())}</small><h3>${safe(member.name)}</h3></span></div>
        <p>${safe(member.responsibility || "担当範囲未設定")}</p>
        <div class="v7-membertags">${assigned.length ? assigned.map(name => `<span>${safe(name)}</span>`).join("") : "<span>Staff未割当</span>"}</div>
        ${options.canEdit ? `<button class="btn secondary small" data-v7-action="edit-member" data-member-role="${safe(member.role)}" data-id="${safe(member.id)}">編集</button>` : ""}
      </article>
    `;
  }

  function renderPeopleV70() {
    const root = ensurePeoplePage();
    if (state.page !== "people") return;
    const org = organization();
    const canManage = state.role === "management";
    const readyCount = org.staffMembers.filter(member =>
      member.status === "active" && onboardingReadiness(member, payload.staffWorkspaces[member.id]).operationReady
    ).length;
    root.innerHTML = `
      <div class="v7-pagehead">
        <div><div class="eyebrow">PEOPLE / TEAM</div><h1>誰が、誰の成長を支えるか。</h1><p class="lead">StaffのJourneyと、Support・Managementの担当範囲を一か所で管理します。</p></div>
        ${canManage ? `<div class="v7-headbuttons"><button class="btn primary" data-v7-action="add-member" data-member-role="staff">＋ Staff</button><button class="btn secondary" data-v7-action="add-member" data-member-role="support">＋ Support</button><button class="btn secondary" data-v7-action="add-member" data-member-role="management">＋ Management</button></div>` : ""}
      </div>
      <div class="v7-people-summary">
        <div><b>${org.staffMembers.filter(item => item.status === "active").length}</b><span>Active Staff</span></div>
        <div><b>${readyCount}</b><span>Ready to Operate</span></div>
        <div><b>${org.supportMembers.filter(item => item.status === "active").length}</b><span>Support</span></div>
        <div><b>${org.managementMembers.filter(item => item.status === "active").length}</b><span>Management</span></div>
      </div>
      <div class="v7-sectionhead"><div><h2>Staff</h2><p>現在地・期限・Issue・次のモデル・Evidence・担当を一目で確認します。</p></div></div>
      <section class="v7-staffgrid">${org.staffMembers.map(member => staffCard(member, { canEdit: canManage })).join("")}</section>
      <div class="v7-sectionhead"><div><h2>Support</h2><p>判断修正を担当する人と対象Staff。</p></div></div>
      <section class="v7-membergrid">${org.supportMembers.map(member => roleMemberCard(member, { canEdit: canManage })).join("")}</section>
      <div class="v7-sectionhead"><div><h2>Management</h2><p>閲覧範囲・担当・監査主体を分離します。</p></div></div>
      <section class="v7-membergrid">${org.managementMembers.map(member => roleMemberCard(member, { canEdit: canManage })).join("")}</section>
    `;
  }

  function managementAlert(member, workspace) {
    const metrics = workspaceMetrics(workspace);
    if (Number(workspace?.overtimeHours) > 0) return { level: "critical", text: "時間外前提" };
    if (!metrics.onTime) return { level: "critical", text: "期限超過見込み" };
    if (metrics.gap < -8) return { level: "warning", text: "進捗遅延" };
    if (metrics.evidenceMissing) return { level: "warning", text: "Evidence不足" };
    if (!metrics.futureModels.length) return { level: "warning", text: "モデル未設定" };
    if (Number(workspace?.issue?.age) >= 14) return { level: "warning", text: "Issue停滞" };
    return { level: "good", text: "計画線上" };
  }

  function renderManagementV70() {
    const root = document.getElementById("management");
    if (!root || state.page !== "management") return;
    const manager = activeMember("management");
    const scopedIds = asArray(manager?.staffIds);
    const visibleStaff = organization().staffMembers.filter(member =>
      member.status === "active" && (!scopedIds.length || scopedIds.includes(member.id))
    );
    if (managementMode === "detail") {
      const staff = activeStaff();
      const workspace = activeWorkspace();
      const metrics = workspaceMetrics(workspace);
      const alert = managementAlert(staff, workspace);
      const audits = organization().auditLog
        .filter(row => row.targetStaffId === staff?.id && row.action !== "Growth OS v7.0を起動")
        .slice(0, 12);
      root.innerHTML = `
        <div class="v7-pagehead">
          <div><div class="eyebrow">MANAGEMENT / STAFF DETAIL</div><h1>${safe(staff?.name || "Staff")}の成長構造。</h1><p class="lead">人を採点せず、期限・停滞・支援・資産化のどこが止まっているかを確認します。</p></div>
          <button class="btn secondary" data-v7-action="management-all">全体一覧へ</button>
        </div>
        <section class="v7-management-hero ${alert.level}">
          <div><span>${safe(alert.text)}</span><h2>${safe(workspace?.vision || "Vision未設定")}</h2><p>${safe(workspace?.issue?.title || "今回の問い未設定")}</p></div>
          <div class="v7-management-ring" style="--p:${metrics.progress}"><b>${metrics.progress}%</b><span>Journey</span></div>
        </section>
        <div class="v7-management-metrics">
          <div><span>DEADLINE</span><b>${metrics.daysLeft}日</b><small>${safe(workspace?.deadline || "-")}</small></div>
          <div><span>SCHEDULE GAP</span><b>${metrics.gap > 0 ? "+" : ""}${metrics.gap}%</b><small>Plan ${metrics.planned}%</small></div>
          <div><span>EVIDENCE</span><b>${metrics.evidence}</b><small>${metrics.evidenceMissing ? "Current CPで不足" : "Current CPへ接続済み"}</small></div>
          <div><span>SUPPORT / PRACTICE</span><b>${metrics.support.length} / ${metrics.practices.length}</b><small>過剰介入を確認</small></div>
        </div>
        <div class="v7-management-grid">
          <section class="card"><div class="title">CURRENT CHECKPOINT</div><h2>${safe(metrics.current ? `${metrics.current.code} ${metrics.current.title}` : "未設定")}</h2><p>${safe(metrics.current?.criteria || "")}</p><button class="btn primary" data-page="journey">Journeyを確認</button></section>
          <section class="card"><div class="title">PRIMARY SUPPORT</div><h2>${safe(supportName(staff, workspace))}</h2><p>担当割当と介入率を見て、本人が考える余白を確保します。</p><button class="btn secondary" data-page="people">担当を編集</button></section>
        </div>
        <section class="card v7-audit"><div class="title">MANAGEMENT AUDIT</div><h2>誰が、何を変えたか。</h2>${audits.map(row => `<div><b>${safe(row.actorName)}</b><span>${safe(row.action)}</span><small>${safe(new Date(row.at).toLocaleString("ja-JP"))}　${safe(row.detail)}</small></div>`).join("") || "<p>監査履歴はまだありません。</p>"}</section>
      `;
      return;
    }

    const rows = visibleStaff.map(member => {
      const workspace = payload.staffWorkspaces[member.id];
      const alert = managementAlert(member, workspace);
      return { member, workspace, alert, metrics: workspaceMetrics(workspace) };
    });
    root.innerHTML = `
      <div class="v7-pagehead">
        <div><div class="eyebrow">MANAGEMENT / ORGANIZATION</div><h1>人ではなく、止まっている構造を見る。</h1><p class="lead">期限超過・Issue停滞・過剰介入・Evidence不足をStaff横断で見つけます。</p></div>
        <button class="btn secondary" data-page="people">People / Team</button>
      </div>
      <div class="v7-management-metrics">
        <div><span>VISIBLE STAFF</span><b>${rows.length}</b><small>${safe(manager?.name || "Management")}の閲覧範囲</small></div>
        <div><span>AT RISK</span><b>${rows.filter(row => row.alert.level !== "good").length}</b><small>確認が必要</small></div>
        <div><span>NO MODEL</span><b>${rows.filter(row => !row.metrics.futureModels.length).length}</b><small>実践機会不足</small></div>
        <div><span>EVIDENCE GAP</span><b>${rows.filter(row => row.metrics.evidenceMissing).length}</b><small>Current CP</small></div>
      </div>
      <section class="v7-management-table">
        ${rows.map(row => `
          <button class="v7-management-row" data-v7-action="management-detail" data-id="${safe(row.member.id)}">
            <span>${renderAvatar(row.member)}<b>${safe(row.member.name)}</b></span>
            <span><small>CURRENT</small>${safe(row.metrics.current ? `${row.metrics.current.code} ${row.metrics.current.title}` : "未設定")}</span>
            <span><small>PROGRESS</small>${row.metrics.progress}%</span>
            <span><small>DEADLINE</small>${row.metrics.daysLeft}日</span>
            <span class="v7-status ${row.alert.level}">${safe(row.alert.text)}</span>
          </button>
        `).join("") || "<p>閲覧対象Staffがいません。People / Teamで担当範囲を設定してください。</p>"}
      </section>
      <div class="v7-sectionhead"><div><h2>Staff cards</h2><p>次のモデルと担当Supportまで含む個人サマリー。</p></div></div>
      <section class="v7-staffgrid">${rows.map(row => staffCard(row.member, { management: true, canEdit: true })).join("")}</section>
    `;
  }

  function ensureMemberModal() {
    if (document.getElementById("v7MemberModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal hidden" id="v7MemberModal">
        <div class="modalbox v7-membermodal">
          <button class="close" data-v7-action="close-member">×</button>
          <div class="eyebrow" id="v7MemberEyebrow">PEOPLE</div>
          <h2 id="v7MemberHeading">人物を編集</h2>
          <div class="v7-memberform">
            <label><span>名前</span><input id="v7MemberName" autocomplete="off"></label>
            <div class="v7-formrow">
              <label><span>Initial</span><input id="v7MemberInitial" maxlength="2"></label>
              <label><span>Avatar URL（任意）</span><input id="v7MemberAvatar" type="url"></label>
            </div>
            <label><span>担当・役割</span><textarea id="v7MemberResponsibility" placeholder="例：カット育成 / 接客 / 店舗全体"></textarea></label>
            <div id="v7MemberAssignments"></div>
          </div>
          <div class="v7-modalactions">
            <button class="btn danger hidden" id="v7ArchiveMember" data-v7-action="archive-member">アーカイブ</button>
            <button class="btn secondary hidden" id="v7RestoreMember" data-v7-action="restore-member">復帰</button>
            <div></div>
            <button class="btn secondary" data-v7-action="close-member">キャンセル</button>
            <button class="btn primary" data-v7-action="save-member">保存</button>
          </div>
        </div>
      </div>
    `);
  }

  function openMemberModal(role, id) {
    if (state.role !== "management") {
      alert("人物の追加・編集はManagementで行います。");
      return;
    }
    ensureMemberModal();
    const existing = id ? memberList(role).find(member => member.id === id) : null;
    editingMember = { role, id: existing?.id || null };
    document.getElementById("v7MemberEyebrow").textContent = role.toUpperCase();
    document.getElementById("v7MemberHeading").textContent = existing ? `${existing.name}を編集` : `${role}を追加`;
    document.getElementById("v7MemberName").value = existing?.name || "";
    document.getElementById("v7MemberInitial").value = existing?.initial || "";
    document.getElementById("v7MemberAvatar").value = existing?.avatar || "";
    document.getElementById("v7MemberResponsibility").value = existing?.responsibility || "";
    document.getElementById("v7ArchiveMember").classList.toggle("hidden", !existing || existing.status === "archived");
    document.getElementById("v7RestoreMember").classList.toggle("hidden", !existing || existing.status !== "archived");
    const assignments = document.getElementById("v7MemberAssignments");
    if (role === "staff") {
      const selected = asArray(existing?.supportMemberIds);
      assignments.innerHTML = `
        <label><span>Primary Support</span><select id="v7PrimarySupport"><option value="">未割当</option>${personOptions("support", existing?.primarySupportId)}</select></label>
        <fieldset><legend>担当Support</legend>${organization().supportMembers.filter(member => member.status === "active").map(member => `<label class="v7-check"><input type="checkbox" data-v7-support-id="${safe(member.id)}" ${selected.includes(member.id) ? "checked" : ""}><span>${safe(member.name)}</span></label>`).join("") || "<p>Supportが登録されていません。</p>"}</fieldset>
      `;
    } else {
      const selected = asArray(existing?.staffIds);
      assignments.innerHTML = `
        <fieldset><legend>${role === "support" ? "担当Staff" : "閲覧対象Staff（未選択なら全員）"}</legend>${organization().staffMembers.filter(member => member.status === "active").map(member => `<label class="v7-check"><input type="checkbox" data-v7-staff-id="${safe(member.id)}" ${selected.includes(member.id) ? "checked" : ""}><span>${safe(member.name)}</span></label>`).join("")}</fieldset>
      `;
    }
    document.getElementById("v7MemberModal").classList.remove("hidden");
  }

  function closeMemberModal() {
    document.getElementById("v7MemberModal")?.classList.add("hidden");
    editingMember = null;
  }

  function saveMember() {
    if (!editingMember) return;
    const { role, id } = editingMember;
    const name = document.getElementById("v7MemberName").value.trim();
    if (!name) return alert("名前を入力してください。");
    const list = memberList(role);
    let member = id ? list.find(item => item.id === id) : null;
    const creating = !member;
    if (!member) {
      member = Core.createMember(role, { name });
      list.push(member);
    }
    member.name = name;
    member.initial = document.getElementById("v7MemberInitial").value.trim() || name.slice(0, 1);
    member.avatar = document.getElementById("v7MemberAvatar").value.trim();
    member.responsibility = document.getElementById("v7MemberResponsibility").value.trim();
    member.updatedAt = isoNow();

    if (role === "staff") {
      member.primarySupportId = document.getElementById("v7PrimarySupport")?.value || "";
      member.supportMemberIds = [...document.querySelectorAll("[data-v7-support-id]:checked")]
        .map(input => input.dataset.v7SupportId);
      if (member.primarySupportId && !member.supportMemberIds.includes(member.primarySupportId)) {
        member.supportMemberIds.unshift(member.primarySupportId);
      }
      if (creating) {
        payload.staffWorkspaces[member.id] = Core.createWorkspace(member.id, null, { blank: true });
      }
    } else {
      member.staffIds = [...document.querySelectorAll("[data-v7-staff-id]:checked")]
        .map(input => input.dataset.v7StaffId);
      if (role === "support") {
        for (const staff of organization().staffMembers) {
          const ids = new Set(asArray(staff.supportMemberIds));
          if (member.staffIds.includes(staff.id)) ids.add(member.id);
          else ids.delete(member.id);
          staff.supportMemberIds = [...ids];
          if (!staff.primarySupportId && ids.size) staff.primarySupportId = [...ids][0];
          if (staff.primarySupportId === member.id && !ids.has(member.id)) {
            staff.primarySupportId = [...ids][0] || "";
          }
        }
      }
    }
    syncAssignments();
    audit(creating ? "人物を追加" : "人物を編集", `${role}: ${member.name}`, {
      staffId: role === "staff" ? member.id : organization().activeStaffId
    });
    persistPayload();
    closeMemberModal();
    if (creating && role === "staff") {
      applyActiveWorkspace(member.id, { role: state.role, page: "people" });
      render();
      openOnboarding(member.id);
      return;
    }
    render();
  }

  function setMemberStatus(status) {
    if (!editingMember?.id) return;
    const list = memberList(editingMember.role);
    const member = list.find(item => item.id === editingMember.id);
    if (!member) return;
    if (status === "archived" && list.filter(item => item.status === "active").length <= 1) {
      alert("各役割には最低1名のActive人物が必要です。");
      return;
    }
    member.status = status;
    member.updatedAt = isoNow();
    audit(status === "archived" ? "人物をアーカイブ" : "人物を復帰", `${member.role}: ${member.name}`, {
      staffId: member.role === "staff" ? member.id : organization().activeStaffId
    });
    if (status === "archived") {
      if (member.role === "staff" && organization().activeStaffId === member.id) {
        syncCurrentWorkspace();
        organization().activeStaffId = list.find(item => item.status === "active" && item.id !== member.id).id;
        applyActiveWorkspace(organization().activeStaffId, {
          role: state.role,
          page: "people",
          skipSync: true
        });
      }
      if (member.role === "support" && organization().activeSupportId === member.id) {
        organization().activeSupportId = list.find(item => item.status === "active" && item.id !== member.id).id;
        for (const staff of organization().staffMembers) {
          staff.supportMemberIds = asArray(staff.supportMemberIds).filter(id => id !== member.id);
          if (staff.primarySupportId === member.id) {
            staff.primarySupportId = staff.supportMemberIds[0] || "";
          }
        }
      }
      if (member.role === "management" && organization().activeManagementId === member.id) {
        organization().activeManagementId = list.find(item => item.status === "active" && item.id !== member.id).id;
      }
    }
    persistPayload();
    closeMemberModal();
    render();
  }

  function renderSettingsV70() {
    const root = document.getElementById("settings");
    if (!root || state.page !== "settings") return;
    const staff = activeStaff();
    const canEdit = state.role !== "support";
    const disabled = canEdit ? "" : "disabled";
    root.innerHTML = `
      <div class="v7-pagehead">
        <div><div class="eyebrow">SETTINGS / GROWTH DESIGN</div><h1>Visionと時間から、やらないことを決める。</h1><p class="lead">${safe(staff?.name || "Staff")}の期限・勤務時間内キャパシティ・今回の問いを設定します。</p></div>
        <div class="v7-headbuttons">
          ${canEdit ? `<button class="btn primary" data-v7-action="open-onboarding" data-id="${safe(staff?.id || "")}">初期設定を開く</button>` : ""}
          ${state.role === "management" ? `<button class="btn secondary" data-page="people">People / Team</button>` : ""}
        </div>
      </div>
      <div class="v7-settings-grid">
        <section class="card">
          <div class="title">STAFF WORKSPACE</div>
          <div class="v7-form">
              <label><span>なりたい美容師像</span><textarea id="v7Vision" ${disabled}>${safe(state.vision)}</textarea></label>
            <div class="v7-formrow">
              <label><span>到達期限</span><input id="v7Deadline" type="date" value="${safe(state.deadline)}" ${disabled}></label>
              <label><span>勤務時間内で使える時間 / 週</span><input id="v7Hours" type="number" min="0" step=".5" value="${Number(state.hours) || 0}" ${disabled}></label>
            </div>
            <div class="v7-formrow">
              <label><span>重点領域</span><select id="v7Focus" ${disabled}>${["技術", "接客", "人間力", "判断力", "自走力"].map(value => `<option ${state.focusArea === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label><span>計画進捗</span><input id="v7Planned" type="number" min="0" max="100" value="${Number(state.planned) || 0}" ${disabled}></label>
            </div>
            <label><span>Issue A / 今回の問い</span><textarea id="v7Issue" ${disabled}>${safe(state.issue?.title || "")}</textarea></label>
          </div>
          ${canEdit ? `<button class="btn primary" data-v7-action="save-workspace-settings">このStaffの設定を保存</button>` : `<p class="lead">SupportはPeople / TeamとStaff設定を閲覧できます。変更はStaff本人またはManagementが行います。</p>`}
        </section>
        <aside>
          <section class="card v7-backup">
            <div class="title">ORGANIZATION BACKUP</div>
            <h2>複数人物・画像・履歴を一括保存。</h2>
            <p>新しいv7 JSONと旧v6以前のJSONの両方を読み込めます。読み込み前の状態へ戻すこともできます。</p>
            <div><button class="btn secondary" data-v7-action="export-json">書き出す</button><button class="btn secondary" data-v7-action="choose-import">読み込む</button><button class="btn secondary" data-v7-action="rollback-import" ${localStorage.getItem(ROLLBACK_KEY) ? "" : "disabled"}>読み込み前へ戻す</button></div>
            <input class="hidden" id="v7Import" type="file" accept="application/json,.json">
          </section>
          <section class="card v7-schema">
            <div class="title">DATA MODEL v7</div>
            <p>Organization → People → Staff Workspaces。Libraryは店舗共有、Journey・Practice・Evidence・Support履歴はStaff別です。</p>
          </section>
        </aside>
      </div>
    `;
  }

  function saveWorkspaceSettings() {
    const previous = {
      vision: state.vision,
      deadline: state.deadline,
      hours: state.hours,
      focusArea: state.focusArea,
      planned: state.planned,
      issue: state.issue?.title
    };
    state.vision = document.getElementById("v7Vision").value.trim();
    state.visionProfile = Core.normalizeVisionProfile(Object.assign(
      {},
      state.visionProfile || {},
      { statement: state.vision, updatedAt: isoNow() }
    ), state);
    state.deadline = document.getElementById("v7Deadline").value;
    state.hours = Math.max(0, Number(document.getElementById("v7Hours").value) || 0);
    state.overtimeHours = 0;
    state.focusArea = document.getElementById("v7Focus").value;
    state.planned = Math.max(0, Math.min(100, Number(document.getElementById("v7Planned").value) || 0));
    state.issue = state.issue || {};
    state.issue.title = document.getElementById("v7Issue").value.trim();
    state.issue.updatedAt = isoNow();
    const checkpoint = currentCheckpoint();
    if (checkpoint) checkpoint.issue = state.issue.title;
    state.meta = state.meta || {};
    updateOnboardingStatus(state, activeStaff());
    audit("Staff成長設定を変更", JSON.stringify({ previous, next: {
      vision: state.vision,
      deadline: state.deadline,
      hours: state.hours,
      focusArea: state.focusArea,
      planned: state.planned,
      issue: state.issue.title
    }}));
    save();
    render();
  }

  function exportJsonV70() {
    syncCurrentWorkspace();
    persistPayload();
    const exported = Core.exportPayload(payload);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `growth-os-v7-2-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function importJsonV70(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        localStorage.setItem(ROLLBACK_KEY, JSON.stringify(payload));
        payload = parsed?.organization
          ? Core.normalizeOrganizationPayload(parsed, state)
          : Core.migrateLegacy(parsed, { sourceKey: "legacy-json-import" });
        organization().auditLog.unshift({
          id: Core.uid("audit", Date.now()),
          at: isoNow(),
          actorId: "system",
          actorName: "System",
          actorRole: "system",
          targetStaffId: organization().activeStaffId,
          action: "JSONを読み込み",
          detail: parsed?.organization ? "v7 organization" : "legacy single state"
        });
        for (const workspace of Object.values(payload.staffWorkspaces)) {
          normalizeWorkspaceRecords(workspace);
        }
        applyActiveWorkspace(organization().activeStaffId, {
          role: organization().ui?.role || "staff",
          page: "home"
        });
        persistPayload();
        render();
        alert("組織データを読み込みました。");
      } catch (_) {
        alert("Growth OSのJSONを読み込めませんでした。");
      }
    };
    reader.readAsText(file);
  }

  function rollbackImportV70() {
    try {
      const previous = JSON.parse(localStorage.getItem(ROLLBACK_KEY) || "null");
      if (!previous) return;
      payload = Core.normalizeOrganizationPayload(previous, state);
      applyActiveWorkspace(organization().activeStaffId, {
        role: organization().ui?.role || "staff",
        page: "settings"
      });
      persistPayload();
      render();
    } catch (_) {
      alert("読み込み前の状態へ戻せませんでした。");
    }
  }

  function captureActionSnapshot(action) {
    const checkpoint = currentCheckpoint();
    pendingBeforeAction = {
      action,
      staffId: organization().activeStaffId,
      supportLength: asArray(state.supportSessions).length,
      practiceLength: asArray(state.practiceSessions).length,
      libraryIds: asArray(state.library).map(asset => asset.id),
      libraryHistory: Object.fromEntries(asArray(state.library).map(asset => [
        asset.id,
        asArray(asset.history).length
      ])),
      evidenceLength: asArray(checkpoint?.evidenceItems).length,
      auditLength: organization().auditLog.length
    };
  }

  function enrichChangedRecords() {
    const before = pendingBeforeAction;
    pendingBeforeAction = null;
    if (!before || before.staffId !== organization().activeStaffId) return;
    const context = actorContext();
    const workspace = state;
    let changed = false;

    asArray(workspace.practiceSessions).slice(before.practiceLength).forEach(session => {
      session.staffId = before.staffId;
      session.actorId = context.actorId;
      session.actorName = context.actorName;
      session.actorRole = context.actorRole;
      session.by = context.actorName;
      changed = true;
    });
    asArray(workspace.supportSessions).slice(before.supportLength).forEach(session => {
      const support = activeMember("support");
      session.staffId = before.staffId;
      session.supportId = support?.id || "";
      session.supportName = support?.name || "Support";
      session.actorId = support?.id || "";
      session.actorName = support?.name || "Support";
      session.by = support?.name || "Support";
      changed = true;
    });
    const checkpoint = currentCheckpoint();
    asArray(checkpoint?.evidenceItems).slice(before.evidenceLength).forEach(evidence => {
      evidence.staffId = before.staffId;
      evidence.actorId = context.actorId;
      evidence.by = context.actorName;
      changed = true;
    });
    asArray(workspace.library).forEach(asset => {
      const isNew = !before.libraryIds.includes(asset.id);
      const historyChanged = asArray(asset.history).length > (before.libraryHistory[asset.id] || 0);
      if (!isNew && !historyChanged) return;
      asset.staffIds = Array.from(new Set([...asArray(asset.staffIds), before.staffId]));
      asset.updatedBy = context.actorName;
      asset.updatedById = context.actorId;
      const last = asArray(asset.history)[asset.history.length - 1];
      if (last) {
        last.by = context.actorName;
        last.byId = context.actorId;
        last.role = context.actorRole;
        last.staffId = before.staffId;
      }
      changed = true;
    });

    const managementAction = state.role === "management" && [
      "save-checkpoint", "set-current-checkpoint", "complete-checkpoint",
      "add-evidence", "remove-evidence"
    ].includes(before.action);
    if (managementAction) {
      audit("Management判断・設定変更", before.action, { staffId: before.staffId });
      changed = true;
    }
    if (changed) {
      if (before.action.includes("support")) {
        audit("Support判断を記録", state.issue?.title || "", { staffId: before.staffId });
      } else if (before.action.includes("practice")) {
        audit("PracticeをEvidence化", state.issue?.title || "", { staffId: before.staffId });
      } else if (before.action.includes("asset")) {
        audit("Library資産を更新", "", { staffId: before.staffId });
      }
      save();
      render();
    }
  }

  function renderRoleRestrictions() {
    document.body.dataset.growthRole = state.role;
    document.querySelectorAll(".role").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.role === state.role));
    });
  }

  function refreshVersion() {
    document.title = "Growth OS v7.4";
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = "v7.4";
  }

  function renderV70() {
    legacyRender();
    ensurePeoplePage();
    enhanceNavigation();
    renderSwitcher();
    renderOnboardingBanner();
    renderIssueV70();
    renderSupportContext();
    renderPeopleV70();
    renderManagementV70();
    renderSettingsV70();
    renderRoleRestrictions();
    refreshVersion();
    updateSavedIndicator();
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.id === state.page);
    });
    document.querySelectorAll(".nav").forEach(button => {
      button.classList.toggle("active", button.dataset.page === state.page);
    });
  }

  render = renderV70;

  document.addEventListener("change", event => {
    if (event.target.id === "v7ActorSelect") {
      const role = state.role;
      const id = event.target.value;
      if (role === "staff") {
        switchStaff(id, state.page);
        return;
      }
      if (role === "support") organization().activeSupportId = id;
      if (role === "management") organization().activeManagementId = id;
      ensureScopedTarget(role);
      audit("操作主体を変更", activeMember(role)?.name || "");
      persistPayload();
      render();
    }
    if (event.target.id === "v7TargetStaffSelect") {
      switchStaff(event.target.value, state.page);
    }
    if (event.target.id === "v7Import") {
      const file = event.target.files?.[0];
      importJsonV70(file);
      event.target.value = "";
    }
  });

  document.addEventListener("click", event => {
    const dataAction = event.target.closest("[data-action]")?.dataset.action || "";
    const practiceAction = event.target.closest("[data-practice-action]")?.dataset.practiceAction || "";
    const tracked = [
      "save-support", "apply-support", "support-to-library",
      "save-asset", "add-evidence", "remove-evidence",
      "save-checkpoint", "set-current-checkpoint", "complete-checkpoint"
    ];
    if (tracked.includes(dataAction)) {
      captureActionSnapshot(dataAction);
      setTimeout(enrichChangedRecords, 0);
    }
    if (practiceAction === "complete") {
      captureActionSnapshot("practice-complete");
      setTimeout(enrichChangedRecords, 0);
    }
    if (event.target.closest("[data-practice-library]")) {
      captureActionSnapshot("practice-asset");
      setTimeout(enrichChangedRecords, 0);
    }
  }, true);

  document.addEventListener("click", event => {
    const roleNode = event.target.closest("[data-role]");
    if (roleNode) {
      setTimeout(() => {
        ensureScopedTarget(state.role);
        organization().ui.role = state.role;
        organization().ui.pages[state.role] = state.page;
        persistPayload();
        render();
      }, 0);
    }

    const pageNode = event.target.closest("[data-page]");
    if (pageNode && pageNode.dataset.page === "people") {
      state.page = "people";
      organization().ui.pages[state.role] = "people";
      save();
      render();
      return;
    }

    const action = event.target.closest("[data-v7-action]");
    if (!action) return;
    const name = action.dataset.v7Action;
    if (name === "add-member") openMemberModal(action.dataset.memberRole);
    if (name === "edit-member") openMemberModal(action.dataset.memberRole, action.dataset.id);
    if (name === "close-member") closeMemberModal();
    if (name === "save-member") saveMember();
    if (name === "archive-member") setMemberStatus("archived");
    if (name === "restore-member") setMemberStatus("active");
    if (name === "select-staff") {
      const targetPage = state.role === "management" ? "management" : "home";
      if (state.role === "management") managementMode = "detail";
      switchStaff(action.dataset.id, targetPage);
    }
    if (name === "management-detail") {
      managementMode = "detail";
      switchStaff(action.dataset.id, "management");
    }
    if (name === "management-all") {
      managementMode = "all";
      render();
    }
    if (name === "open-onboarding") openOnboarding(action.dataset.id || activeStaff()?.id);
    if (name === "close-onboarding") closeOnboarding();
    if (name === "onboarding-back") moveOnboarding(-1);
    if (name === "onboarding-next") moveOnboarding(1);
    if (name === "save-workspace-settings") saveWorkspaceSettings();
    if (name === "export-json") exportJsonV70();
    if (name === "choose-import") document.getElementById("v7Import")?.click();
    if (name === "rollback-import") rollbackImportV70();
  });

  document.addEventListener("click", event => {
    const dataAction = event.target.closest("[data-action]")?.dataset.action || "";
    const v60Action = event.target.closest("[data-v60-action]")?.dataset.v60Action || "";
    if (v60Action === "save-settings" && state.role === "management") {
      captureActionSnapshot("management-settings");
      setTimeout(() => {
        audit("Managementが成長設定を変更", state.issue?.title || "");
        save();
      }, 0);
    }
  }, true);

  document.addEventListener("click", event => {
    const openMenu = event.target.closest('[data-v60-action="open-mobile-menu"]');
    if (!openMenu) return;
    setTimeout(() => {
      const panel = document.querySelector(".v60-mobile-panel");
      if (panel && !panel.querySelector('[data-page="people"]')) {
        panel.insertAdjacentHTML("beforeend", `<button data-page="people" data-v60-action="close-mobile-menu">People / Team</button>`);
      }
    }, 0);
  });

  window.GrowthTeam = {
    actorName,
    actorContext,
    getPayload: () => clone(payload),
    activeStaff: () => clone(activeStaff()),
    activeWorkspace: () => clone(activeWorkspace()),
    switchStaff,
    onboardingReadiness: staffId => {
      const member = organization().staffMembers.find(item => item.id === staffId);
      return clone(onboardingReadiness(member, payload.staffWorkspaces[staffId]));
    },
    exportPayload: () => Core.exportPayload(payload)
  };

  payload = readPayload();
  for (const [staffId, workspace] of Object.entries(payload.staffWorkspaces)) {
    normalizeWorkspaceRecords(workspace);
    updateOnboardingStatus(
      workspace,
      organization().staffMembers.find(member => member.id === staffId)
    );
  }
  const initialRole = organization().ui?.role || state.role || "staff";
  const initialPage = activePage(initialRole);
  applyActiveWorkspace(organization().activeStaffId, {
    role: initialRole,
    page: initialPage
  });
  save();
  render();
})();
