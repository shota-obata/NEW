;(() => {
  if (window.__growthStabilizationV60) return;
  window.__growthStabilizationV60 = true;

  const SCHEMA_VERSION = 6;
  const ROLLBACK_KEY = "growthOS.unified.v6.rollback";
  const LEGACY_KEYS = [
    "growthOS.unified.v6",
    "growthOS.deep.v6.1",
    "growthOS.visual.v7.practice",
    "growthOS.data.v4",
    "growthOS.support.v4.3",
    "growthOS.management.v4.4",
    "kurosaka_growth_os_v6"
  ];
  const validPages = new Set([
    "home", "journey", "issue", "practice", "library",
    "planner", "support", "management", "settings"
  ]);
  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  const clone = value => {
    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  };
  const readJson = key => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  };
  const asArray = value => Array.isArray(value) ? value : [];
  const todayInput = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  };
  const dateValue = value => {
    if (!value) return null;
    const parsed = new Date(`${value}T23:59:59`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const dayDifference = (from, to) => Math.ceil((to - from) / 86400000);
  const actor = () => state.role === "support"
    ? "Support"
    : state.role === "management"
      ? "Management"
      : "Staff";
  const stamp = () => typeof now === "function"
    ? now()
    : new Date().toLocaleString("ja-JP", { hour12: false });

  function normalizeSnapshot(input) {
    let source = input && typeof input === "object" ? input : {};
    if (source.format === "growth-os-backup" && source.state) source = source.state;
    if (source.data && source.format === "growth-os-backup") source = source.data;

    const base = clone(fallback);
    const legacyVision = source.vision && typeof source.vision === "object"
      ? source.vision.text
      : source.vision;
    const legacyRecords = asArray(source.records);
    const mappedPractice = legacyRecords.map(record => ({
      id: record.id || `legacy-practice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      checkpointId: "",
      modelId: "",
      modelName: record.title || "",
      menu: record.type || "",
      question: record.issueA || "",
      hypothesis: record.cause || "",
      plan: record.action || "",
      result: record.result || "",
      win: record.win || "",
      gap: record.roughness || "",
      next: record.experiment || "",
      minutes: 0,
      evidenceTitle: record.keyInsight || "",
      by: "Legacy",
      at: record.date || record.createdAt || ""
    }));

    const result = Object.assign({}, base, source);
    result.vision = typeof legacyVision === "string" && legacyVision.trim()
      ? legacyVision
      : base.vision;
    result.deadline = source.deadline || base.deadline;
    result.hours = Math.max(0, Number(source.hours ?? source.weeklyHours ?? 6) || 0);
    result.overtimeHours = Math.max(0, Number(source.overtimeHours ?? 0) || 0);
    result.focusArea = source.focusArea || source.currentFocus || "技術";
    result.progress = Math.max(0, Math.min(100, Number(source.progress ?? base.progress) || 0));
    result.planned = Math.max(0, Math.min(100, Number(source.planned ?? base.planned) || 0));
    result.role = ["staff", "support", "management"].includes(source.role)
      ? source.role
      : "staff";
    result.page = validPages.has(source.page) ? source.page : "home";
    result.issue = Object.assign({}, base.issue, source.issue || {});
    if ((!source.issue || !source.issue.title) && legacyRecords[0]?.issueA) {
      result.issue.title = legacyRecords[0].issueA;
    }
    result.issue.age = Math.max(0, Number(result.issue.age) || 0);

    result.journey = Object.assign({}, base.journey, source.journey || {});
    const checkpoints = asArray(source.journey?.checkpoints);
    const rows = checkpoints.length ? checkpoints : base.journey.checkpoints;
    result.journey.checkpoints = rows.map((checkpoint, index) => Object.assign({
      id: `cp${index + 1}`,
      code: `CP${index + 1}`,
      title: `Checkpoint ${index + 1}`,
      date: result.deadline,
      type: "Required",
      status: index === 0 ? "current" : "locked",
      hours: 0,
      actual: 0,
      criteria: "",
      evidence: "",
      issue: "",
      depends: "",
      evidenceItems: [],
      history: [],
      supportHistory: []
    }, checkpoint, {
      evidenceItems: asArray(checkpoint.evidenceItems),
      history: asArray(checkpoint.history),
      supportHistory: asArray(checkpoint.supportHistory)
    }));
    result.journey.history = asArray(result.journey.history);
    result.journey.requiredHours = result.journey.checkpoints.reduce(
      (sum, checkpoint) => sum + (Number(checkpoint.hours) || 0),
      0
    );
    result.journey.actualHours = result.journey.checkpoints.reduce(
      (sum, checkpoint) => sum + (Number(checkpoint.actual) || 0),
      0
    );

    result.library = Array.isArray(source.library)
      ? source.library
      : base.library;
    result.library = result.library.map((asset, index) => Object.assign({
      id: `asset-${index + 1}`,
      title: "Untitled",
      tag: "",
      case: "",
      decision: "",
      correction: "",
      rule: "",
      next: "",
      image: "",
      updatedBy: "System",
      updatedAt: "",
      history: []
    }, asset, { history: asArray(asset.history) }));
    result.modelBookings = Array.isArray(source.modelBookings)
      ? source.modelBookings
      : Array.isArray(source.modelPlans)
        ? source.modelPlans
        : asArray(source.models);
    result.practiceSessions = Array.isArray(source.practiceSessions)
      ? source.practiceSessions
      : mappedPractice;
    result.supportSessions = asArray(source.supportSessions);
    result.practiceDraft = source.practiceDraft && typeof source.practiceDraft === "object"
      ? source.practiceDraft
      : null;
    result.libraryUi = source.libraryUi && typeof source.libraryUi === "object"
      ? source.libraryUi
      : { query: "", filter: "all", view: "grid" };
    result.meta = Object.assign({
      schemaVersion: SCHEMA_VERSION,
      onboardingComplete: Boolean(source.meta?.onboardingComplete),
      migratedFrom: "",
      lastSaved: "",
      createdAt: new Date().toISOString()
    }, source.meta || {}, { schemaVersion: SCHEMA_VERSION });
    return result;
  }

  function legacyCandidate() {
    for (const key of LEGACY_KEYS) {
      const value = readJson(key);
      if (!value || typeof value !== "object") continue;
      const hasData = value.journey || value.library || value.records ||
        value.practiceSessions || value.modelBookings || value.vision;
      if (hasData) return { key, value };
    }
    return null;
  }

  const hadCurrentState = Boolean(window.__growthHadStoredState);
  const legacy = hadCurrentState ? null : legacyCandidate();
  state = normalizeSnapshot(legacy ? legacy.value : state);
  if (legacy) state.meta.migratedFrom = legacy.key;

  const originalSaveV60 = save;
  save = function saveV60() {
    state.meta = state.meta || {};
    state.meta.schemaVersion = SCHEMA_VERSION;
    state.meta.lastSaved = new Date().toISOString();
    originalSaveV60();
  };
  save();

  function currentCheckpoint() {
    const checkpoints = asArray(state.journey?.checkpoints);
    return checkpoints.find(checkpoint => checkpoint.status === "current") ||
      checkpoints.find(checkpoint => checkpoint.status !== "done") ||
      checkpoints[0] ||
      null;
  }

  function managementMetrics() {
    const checkpoints = asArray(state.journey?.checkpoints);
    const totalHours = checkpoints.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
    const actualHours = checkpoints.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
    const progress = totalHours
      ? Math.min(100, Math.round(actualHours / totalHours * 100))
      : Math.max(0, Math.min(100, Number(state.progress) || 0));
    const planned = Math.max(0, Math.min(100, Number(state.planned) || 0));
    const gap = progress - planned;
    const deadline = dateValue(state.deadline);
    const nowDate = new Date();
    const daysLeft = deadline ? Math.max(0, dayDifference(nowDate, deadline)) : 0;
    const weeksLeft = Math.max(1 / 7, daysLeft / 7);
    const remainingHours = Math.max(0, totalHours - actualHours);
    const hoursPerWeek = Math.max(.1, Number(state.hours) || 0);
    const requiredWeekly = remainingHours / weeksLeft;
    const forecastWeeks = remainingHours / hoursPerWeek;
    const forecastDate = new Date(nowDate.getTime() + forecastWeeks * 7 * 86400000);
    const forecastLabel = Number.isNaN(forecastDate.getTime())
      ? "算出不可"
      : forecastDate.toISOString().slice(0, 10);
    const onTime = Boolean(deadline) && forecastDate <= deadline;
    const models = asArray(state.modelBookings);
    const today = todayInput();
    const futureModels = models.filter(model => !model.date || model.date >= today);
    const practices = asArray(state.practiceSessions);
    const support = asArray(state.supportSessions);
    const evidence = checkpoints.reduce(
      (sum, checkpoint) => sum + asArray(checkpoint.evidenceItems).length,
      0
    );
    const converted = asArray(state.library).filter(asset => {
      const tag = String(asset.tag || "").toLowerCase();
      return tag.includes("practice") || tag.includes("support") || tag.includes("transfer");
    }).length;
    const conversionBase = practices.length + support.length;
    const libraryRate = conversionBase
      ? Math.min(100, Math.round(converted / conversionBase * 100))
      : asArray(state.library).length
        ? 100
        : 0;
    const interventionRate = practices.length
      ? Math.round(support.length / practices.length * 100)
      : support.length
        ? 100
        : 0;
    const issueAge = Math.max(0, Number(state.issue?.age) || 0);
    const overtime = Math.max(0, Number(state.overtimeHours) || 0);
    const healthParts = [
      gap >= -8,
      onTime,
      futureModels.length > 0,
      evidence >= practices.length,
      overtime === 0
    ];
    const health = Math.round(healthParts.filter(Boolean).length / healthParts.length * 100);
    return {
      checkpoints, totalHours, actualHours, progress, planned, gap, daysLeft,
      remainingHours, requiredWeekly, forecastLabel, onTime, futureModels,
      practices, support, evidence, libraryRate, interventionRate, issueAge,
      overtime, health, current: currentCheckpoint()
    };
  }

  function alertRows(metrics) {
    const alerts = [];
    if (metrics.overtime > 0) alerts.push({
      level: "critical",
      title: "時間外稼働を検知",
      detail: `時間外 ${metrics.overtime}h。期限・Checkpoint・支援方法を再設計してください。`
    });
    if (!metrics.onTime) alerts.push({
      level: "critical",
      title: "期限超過の見込み",
      detail: `現在ペースの到達予測は ${metrics.forecastLabel}。勤務時間内で成立するルートへ戻します。`
    });
    if (metrics.gap < -8) alerts.push({
      level: "notice",
      title: "Schedule Gap",
      detail: `計画より ${Math.abs(metrics.gap)}% 遅れています。活動量ではなく、Current Checkpointへ直結するEvidenceを増やします。`
    });
    if (!metrics.futureModels.length) alerts.push({
      level: "notice",
      title: "モデル予定が未設定",
      detail: "Model Plannerで先に実践機会を確保し、Issue AとCheckpointへ接続してください。"
    });
    if (metrics.issueAge >= 14) alerts.push({
      level: "notice",
      title: "Issue Aが停滞",
      detail: `${metrics.issueAge}日間継続中です。Issueが正しいか、Supportで比較と原因診断を行います。`
    });
    if (metrics.interventionRate > 120 && metrics.practices.length) alerts.push({
      level: "notice",
      title: "Support介入が高止まり",
      detail: "介入回数がPractice数を上回っています。次回は答えを渡さず、本人の判断を待つ範囲を決めます。"
    });
    if (!alerts.length) alerts.push({
      level: "good",
      title: "Journeyは計画線上です",
      detail: "現在の時間境界と実践サイクルで、期限内の到達が見込めます。"
    });
    return alerts;
  }

  function cycleRows(metrics) {
    const rows = [
      {
        name: "PLAN",
        value: metrics.futureModels.length ? 100 : 0,
        state: metrics.futureModels.length ? "good" : "notice",
        detail: metrics.futureModels.length
          ? `${metrics.futureModels.length}件のモデル予定`
          : "モデル予定なし"
      },
      {
        name: "PRACTICE",
        value: Math.min(100, metrics.practices.length * 20),
        state: metrics.practices.length ? "good" : "notice",
        detail: `${metrics.practices.length}件の実践記録`
      },
      {
        name: "EVIDENCE",
        value: metrics.practices.length
          ? Math.min(100, Math.round(metrics.evidence / metrics.practices.length * 100))
          : metrics.evidence
            ? 100
            : 0,
        state: metrics.evidence ? "good" : "notice",
        detail: `${metrics.evidence}件をCheckpointへ接続`
      },
      {
        name: "SUPPORT",
        value: Math.min(100, metrics.support.length * 25),
        state: metrics.support.length ? "good" : "notice",
        detail: `${metrics.support.length}件の判断修正`
      },
      {
        name: "LIBRARY",
        value: metrics.libraryRate,
        state: metrics.libraryRate >= 50 ? "good" : "notice",
        detail: `資産転換率 ${metrics.libraryRate}%`
      }
    ];
    return rows;
  }

  function renderManagementV60() {
    const root = document.getElementById("management");
    if (!root || state.page !== "management") return;
    const metrics = managementMetrics();
    const alerts = alertRows(metrics);
    const cycles = cycleRows(metrics);
    const cp = metrics.current;
    root.innerHTML = `
      <div class="v60-management">
        <div class="v60-head">
          <div>
            <div class="eyebrow">MANAGEMENT / SYSTEM HEALTH</div>
            <h1>人ではなく、成長の仕組みを見る。</h1>
            <p class="lead">期限・稼働・停滞・過剰介入を見つけ、勤務時間内で成立するJourneyへ戻します。</p>
          </div>
          <div class="v60-head-actions">
            <button class="btn secondary" data-page="planner">Model Planner</button>
            <button class="btn primary" data-page="settings">時間軸を見直す</button>
          </div>
        </div>

        <div class="v60-overview">
          <section class="card v60-health">
            <div class="v60-health-top">
              <div>
                <div class="title" style="color:#aaa79f">GROWTH OS HEALTH</div>
                <h2>${metrics.onTime ? "期限内で成立する設計です。" : "このままでは期限に間に合いません。"}</h2>
                <p>${safe(state.vision)}</p>
              </div>
              <div class="v60-ring" style="--value:${metrics.health}">
                <div><b>${metrics.health}%</b><span>OS HEALTH</span></div>
              </div>
            </div>
            <div class="v60-health-metrics">
              <div><span>PLAN / ACTUAL</span><b>${metrics.planned}% / ${metrics.progress}%</b></div>
              <div><span>SCHEDULE GAP</span><b>${metrics.gap > 0 ? "+" : ""}${metrics.gap}%</b></div>
              <div><span>FORECAST</span><b>${safe(metrics.forecastLabel)}</b></div>
              <div><span>OVERTIME</span><b>${metrics.overtime}h</b></div>
            </div>
          </section>
          <section class="card v60-alert-panel">
            <div class="title">ACTIVE ALERTS</div>
            ${alerts.map(alert => `
              <div class="v60-alert ${alert.level}">
                <strong>${safe(alert.title)}</strong>
                <p>${safe(alert.detail)}</p>
              </div>
            `).join("")}
          </section>
        </div>

        <div class="v60-section-title">
          <div><h2>現在の稼働</h2><p>止まっているか、稼働しすぎているかを確認します。</p></div>
        </div>
        <section class="v60-metrics">
          <div class="v60-metric"><span>CURRENT CHECKPOINT</span><b>${safe(cp ? `${cp.code} ${cp.title}` : "未設定")}</b><small>${safe(state.issue?.title || "Issue A未設定")}</small></div>
          <div class="v60-metric"><span>REQUIRED PACE</span><b>${metrics.requiredWeekly.toFixed(1)}h</b><small>勤務時間内 ${Number(state.hours) || 0}h / week</small></div>
          <div class="v60-metric"><span>SUPPORT RATE</span><b>${metrics.interventionRate}%</b><small>${metrics.support.length} Support / ${metrics.practices.length} Practice</small></div>
          <div class="v60-metric"><span>LIBRARY RATE</span><b>${metrics.libraryRate}%</b><small>${state.library.length} assets / Evidence ${metrics.evidence}件</small></div>
        </section>

        <div class="v60-section-title">
          <div><h2>Growth Loop</h2><p>Plan → Practice → Evidence → Support → Library</p></div>
        </div>
        <section class="v60-cycles">
          ${cycles.map(cycle => `
            <article class="v60-cycle">
              <div class="v60-cycle-head"><b>${cycle.name}</b><i class="v60-dot ${cycle.state}"></i></div>
              <p>${safe(cycle.detail)}</p>
              <div class="progress"><span style="width:${cycle.value}%"></span></div>
            </article>
          `).join("")}
        </section>
      </div>
    `;
  }

  function renderSettingsV60() {
    const root = document.getElementById("settings");
    if (!root || state.page !== "settings") return;
    const checkpointCount = asArray(state.journey?.checkpoints).length;
    const rollbackReady = Boolean(localStorage.getItem(ROLLBACK_KEY));
    root.innerHTML = `
      <div class="v60-settings">
        <div class="v60-head">
          <div>
            <div class="eyebrow">SETTINGS / GROWTH DESIGN</div>
            <h1>Visionと時間から、Journeyを決める。</h1>
            <p class="lead">時間外労働を前提にせず、期限・使える時間・Issue Aを同じ場所で管理します。</p>
          </div>
          <div class="v60-head-actions">
            <button class="btn secondary" data-v60-action="open-onboarding">初期設定をやり直す</button>
          </div>
        </div>
        <div class="v60-settings-grid">
          <section class="card">
            <div class="title">VISION & TIME</div>
            <div class="v60-form" style="margin-top:16px">
              <label class="v60-field"><span>なりたい美容師像</span><textarea id="v60Vision">${safe(state.vision)}</textarea></label>
              <div class="v60-form-row">
                <label class="v60-field"><span>到達期限</span><input id="v60Deadline" type="date" value="${safe(state.deadline)}"></label>
                <label class="v60-field"><span>勤務時間内で使える時間 / 週</span><input id="v60Hours" type="number" min="0" step=".5" value="${Number(state.hours) || 0}"></label>
              </div>
              <div class="v60-form-row">
                <label class="v60-field"><span>現在の重点領域</span>
                  <select id="v60Focus">
                    ${["技術", "接客", "人間力", "判断力", "自走力"].map(value => `<option ${state.focusArea === value ? "selected" : ""}>${value}</option>`).join("")}
                  </select>
                </label>
                <label class="v60-field"><span>計画進捗</span><input id="v60Planned" type="number" min="0" max="100" value="${Number(state.planned) || 0}"></label>
              </div>
              <label class="v60-field"><span>今回の問い（Issue A）</span><textarea id="v60Issue">${safe(state.issue?.title || "")}</textarea></label>
              <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-v60-action="save-settings">設定を保存</button></div>
            </div>
          </section>
          <div class="v60-setting-stack">
            <section class="card">
              <div class="title">DATA BACKUP</div>
              <h2>この端末のデータ</h2>
              <p class="lead">画像・モデル予定・Practice・Support・Library・履歴を一つのJSONへ保存します。</p>
              <div class="v60-data-actions">
                <button class="btn secondary" data-v60-action="export-json">書き出す</button>
                <button class="btn secondary" data-v60-action="choose-import">読み込む</button>
                <button class="btn secondary" data-v60-action="rollback-import" ${rollbackReady ? "" : "disabled"}>読み込み前へ戻す</button>
                <button class="btn secondary" data-v60-action="open-onboarding">初期設定</button>
              </div>
              <input class="v60-import" id="v60Import" type="file" accept="application/json,.json">
            </section>
            <section class="card">
              <div class="title">SYSTEM STATUS</div>
              <div class="v60-setting-meta"><span>SCHEMA</span><b>v${SCHEMA_VERSION}.0</b></div>
              <div class="v60-setting-meta"><span>CHECKPOINTS</span><b>${checkpointCount}</b></div>
              <div class="v60-setting-meta"><span>MODEL / PRACTICE</span><b>${asArray(state.modelBookings).length} / ${asArray(state.practiceSessions).length}</b></div>
              <div class="v60-setting-meta"><span>LAST SAVED</span><b style="font-size:13px">${safe(state.meta?.lastSaved || "未保存")}</b></div>
              ${state.meta?.migratedFrom ? `<div class="v60-setting-meta"><span>MIGRATED FROM</span><b style="font-size:13px">${safe(state.meta.migratedFrom)}</b></div>` : ""}
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function updateCheckpointDates(deadline) {
    const checkpoints = asArray(state.journey?.checkpoints);
    const end = dateValue(deadline);
    if (!checkpoints.length || !end) return;
    const start = new Date();
    start.setHours(23, 59, 59, 0);
    const span = Math.max(checkpoints.length, dayDifference(start, end));
    checkpoints.forEach((checkpoint, index) => {
      const ratio = (index + 1) / checkpoints.length;
      const date = new Date(start.getTime() + span * ratio * 86400000);
      checkpoint.date = date.toISOString().slice(0, 10);
    });
    checkpoints[checkpoints.length - 1].date = deadline;
  }

  function exportJson() {
    const payload = {
      format: "growth-os-backup",
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      storageKey: KEY,
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `growth-os-backup-${todayInput()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("全体バックアップを書き出しました。");
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const candidate = parsed?.state || parsed?.data || parsed;
        if (!candidate || typeof candidate !== "object") throw new Error("invalid");
        localStorage.setItem(ROLLBACK_KEY, JSON.stringify(state));
        state = normalizeSnapshot(candidate);
        state.meta.onboardingComplete = true;
        state.meta.migratedFrom = parsed?.storageKey || "JSON import";
        save();
        render();
        toast("バックアップを読み込みました。");
      } catch (_) {
        alert("JSONを読み込めませんでした。Growth OSのバックアップを選択してください。");
      }
    };
    reader.onerror = () => alert("ファイルを読み込めませんでした。");
    reader.readAsText(file);
  }

  function rollbackImport() {
    const previous = readJson(ROLLBACK_KEY);
    if (!previous) return;
    state = normalizeSnapshot(previous);
    save();
    render();
    toast("読み込み前の状態へ戻しました。");
  }

  let onboardStep = 0;
  let onboardDraft = null;
  let onboardingAuto = false;

  function ensureOverlay() {
    if (!document.getElementById("v60Onboard")) {
      const overlay = document.createElement("div");
      overlay.id = "v60Onboard";
      overlay.className = "v60-onboard hidden";
      document.body.appendChild(overlay);
    }
    if (!document.getElementById("v60MobileSheet")) {
      const sheet = document.createElement("div");
      sheet.id = "v60MobileSheet";
      sheet.className = "v60-mobile-sheet hidden";
      document.body.appendChild(sheet);
    }
    if (!document.getElementById("v60Toast")) {
      const message = document.createElement("div");
      message.id = "v60Toast";
      message.className = "v60-toast";
      document.body.appendChild(message);
    }
  }

  function toast(message) {
    ensureOverlay();
    const el = document.getElementById("v60Toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function openOnboarding(auto = false) {
    ensureOverlay();
    onboardingAuto = auto;
    onboardStep = 0;
    onboardDraft = {
      vision: state.vision || "",
      deadline: state.deadline || "",
      hours: Number(state.hours) || 6,
      focusArea: state.focusArea || "技術",
      issue: state.issue?.title || ""
    };
    renderOnboarding();
    document.getElementById("v60Onboard").classList.remove("hidden");
  }

  function onboardingSteps() {
    return [
      {
        kicker: "STEP 1 / VISION",
        title: "どんな美容師になりたい？",
        lead: "抽象語ではなく、誰に・どんな技術と接客で・何を感じてもらうかまで言葉にします。",
        control: `<textarea id="v60OnboardValue" placeholder="私は、〇〇なお客様に…">${safe(onboardDraft.vision)}</textarea>`
      },
      {
        kicker: "STEP 2 / DEADLINE",
        title: "いつまでに、そこへ到達する？",
        lead: "期限が入ることで、JourneyのCheckpointと今やらないことが決まります。",
        control: `<input id="v60OnboardValue" type="date" value="${safe(onboardDraft.deadline)}">`
      },
      {
        kicker: "STEP 3 / TIME BOUNDARY",
        title: "勤務時間内で、週に何時間使える？",
        lead: "時間外は0時間。足りない場合は努力量ではなく、期限・ルート・支援方法を変えます。",
        control: `<input id="v60OnboardValue" type="number" min="0" step=".5" value="${Number(onboardDraft.hours) || 0}">`
      },
      {
        kicker: "STEP 4 / FOCUS",
        title: "今、最も差がある領域は？",
        lead: "科目を先に決めず、Visionと現在地の差から重点領域を一つ選びます。",
        control: `<select id="v60OnboardValue">${["技術", "接客", "人間力", "判断力", "自走力"].map(value => `<option ${onboardDraft.focusArea === value ? "selected" : ""}>${value}</option>`).join("")}</select>`
      },
      {
        kicker: "STEP 5 / ISSUE A",
        title: "次のCheckpointへ進むための問いは？",
        lead: "苦手ではなく、期限までに今もっとも答える必要がある問いへ変換します。",
        control: `<textarea id="v60OnboardValue" placeholder="例：異なる骨格でも…">${safe(onboardDraft.issue)}</textarea>`
      }
    ];
  }

  function persistOnboardValue() {
    const input = document.getElementById("v60OnboardValue");
    if (!input) return;
    const keys = ["vision", "deadline", "hours", "focusArea", "issue"];
    onboardDraft[keys[onboardStep]] = onboardStep === 2
      ? Math.max(0, Number(input.value) || 0)
      : input.value.trim();
  }

  function renderOnboarding() {
    const overlay = document.getElementById("v60Onboard");
    if (!overlay) return;
    const steps = onboardingSteps();
    const item = steps[onboardStep];
    overlay.innerHTML = `
      <div class="v60-onboard-shell">
        <div class="v60-onboard-top">
          <div class="v60-onboard-brand"><i></i>Growth OS</div>
          <button class="btn secondary" data-v60-action="close-onboarding">${onboardingAuto ? "あとで" : "閉じる"}</button>
        </div>
        <div class="v60-onboard-progress">${steps.map((_, index) => `<i class="${index <= onboardStep ? "active" : ""}"></i>`).join("")}</div>
        <div class="v60-onboard-body">
          <div class="v60-onboard-question">
            <div class="eyebrow">${item.kicker}</div>
            <h2>${item.title}</h2>
            <p>${item.lead}</p>
            ${item.control}
            <div class="v60-onboard-actions">
              <button class="btn secondary" data-v60-action="onboard-prev" ${onboardStep ? "" : "disabled"}>戻る</button>
              <button class="btn primary" data-v60-action="${onboardStep === steps.length - 1 ? "onboard-finish" : "onboard-next"}">${onboardStep === steps.length - 1 ? "Journeyを作成" : "次へ"}</button>
            </div>
          </div>
          <aside class="v60-onboard-summary">
            <div class="title">YOUR GROWTH DESIGN</div>
            <span>VISION</span><b>${safe(onboardDraft.vision || "未設定")}</b>
            <span>DEADLINE</span><b>${safe(onboardDraft.deadline || "未設定")}</b>
            <span>TIME</span><b>${Number(onboardDraft.hours) || 0}h / week・時間外0h</b>
            <span>FOCUS</span><b>${safe(onboardDraft.focusArea || "未設定")}</b>
            <span>ISSUE A</span><b>${safe(onboardDraft.issue || "未設定")}</b>
          </aside>
        </div>
      </div>
    `;
  }

  function finishOnboarding() {
    persistOnboardValue();
    if (!onboardDraft.vision || !onboardDraft.deadline || !onboardDraft.issue) {
      alert("Vision・期限・Issue Aを入力してください。");
      return;
    }
    state.vision = onboardDraft.vision;
    state.deadline = onboardDraft.deadline;
    state.hours = onboardDraft.hours;
    state.overtimeHours = 0;
    state.focusArea = onboardDraft.focusArea;
    state.issue = state.issue || {};
    state.issue.title = onboardDraft.issue;
    state.issue.age = 0;
    state.meta.onboardingComplete = true;
    updateCheckpointDates(state.deadline);
    const cp = currentCheckpoint();
    if (cp) cp.issue = onboardDraft.issue;
    save();
    document.getElementById("v60Onboard").classList.add("hidden");
    state.role = "staff";
    state.page = "home";
    render();
    toast("VisionからJourneyを設定しました。");
  }

  function mobileMenuRows() {
    const common = state.role === "staff"
      ? [
        ["home", "Home"],
        ["journey", "Journey"],
        ["issue", "Issue A"],
        ["practice", "Practice"],
        ["planner", "Model Planner"],
        ["library", "Library"],
        ["settings", "Settings"]
      ]
      : state.role === "support"
        ? [
          ["support", "Support Home"],
          ["journey", "Journey"],
          ["issue", "Issue A"],
          ["practice", "Practice"],
          ["planner", "Model Planner"],
          ["library", "Library"],
          ["settings", "Settings"]
        ]
        : [
          ["management", "Overview"],
          ["journey", "Journey"],
          ["planner", "Model Planner"],
          ["library", "Library"],
          ["settings", "Settings"]
        ];
    return common;
  }

  function refreshMobileNav() {
    const bottom = document.querySelector(".bottom");
    if (!bottom) return;
    const rows = state.role === "staff"
      ? [["home", "Home"], ["journey", "Journey"], ["practice", "＋"], ["library", "Library"]]
      : state.role === "support"
        ? [["support", "Support"], ["journey", "Journey"], ["practice", "＋"], ["library", "Library"]]
        : [["management", "Overview"], ["journey", "Journey"], ["planner", "Models"], ["library", "Library"]];
    bottom.innerHTML = rows.map(([page, label]) => `<button class="${state.page === page ? "active" : ""}" data-page="${page}">${label}</button>`).join("") +
      `<button class="v60-mobile-menu" data-v60-action="open-mobile-menu">More</button>`;
  }

  function openMobileMenu() {
    ensureOverlay();
    const sheet = document.getElementById("v60MobileSheet");
    sheet.innerHTML = `
      <div class="v60-mobile-panel">
        <div class="v60-mobile-handle"></div>
        ${mobileMenuRows().map(([page, label]) => `<button class="${state.page === page ? "active" : ""}" data-page="${page}" data-v60-action="close-mobile-menu">${label}</button>`).join("")}
      </div>
    `;
    sheet.classList.remove("hidden");
  }

  function refreshVersion() {
    document.title = "Growth OS v6.0";
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = "v6.0";
  }

  const previousRenderV60 = render;
  render = function renderV60() {
    previousRenderV60();
    renderManagementV60();
    renderSettingsV60();
    refreshMobileNav();
    refreshVersion();
  };

  document.addEventListener("click", event => {
    const actionNode = event.target.closest("[data-v60-action]");
    if (!actionNode) return;
    const action = actionNode.dataset.v60Action;
    if (action === "save-settings") {
      const oldDeadline = state.deadline;
      state.vision = document.getElementById("v60Vision").value.trim();
      state.deadline = document.getElementById("v60Deadline").value;
      state.hours = Math.max(0, Number(document.getElementById("v60Hours").value) || 0);
      state.overtimeHours = 0;
      state.focusArea = document.getElementById("v60Focus").value;
      state.planned = Math.max(0, Math.min(100, Number(document.getElementById("v60Planned").value) || 0));
      state.issue = state.issue || {};
      state.issue.title = document.getElementById("v60Issue").value.trim();
      const cp = currentCheckpoint();
      if (cp) cp.issue = state.issue.title;
      if (oldDeadline !== state.deadline) updateCheckpointDates(state.deadline);
      state.meta.onboardingComplete = true;
      save();
      render();
      toast("Visionと時間軸を保存しました。");
    }
    if (action === "export-json") exportJson();
    if (action === "choose-import") document.getElementById("v60Import")?.click();
    if (action === "rollback-import") rollbackImport();
    if (action === "open-onboarding") openOnboarding(false);
    if (action === "close-onboarding") document.getElementById("v60Onboard")?.classList.add("hidden");
    if (action === "onboard-next") {
      persistOnboardValue();
      const value = ["vision", "deadline", "hours", "focusArea", "issue"][onboardStep];
      if ((value !== "hours" && !onboardDraft[value]) || (value === "hours" && onboardDraft.hours < 0)) {
        alert("入力してから次へ進んでください。");
        return;
      }
      onboardStep = Math.min(4, onboardStep + 1);
      renderOnboarding();
    }
    if (action === "onboard-prev") {
      persistOnboardValue();
      onboardStep = Math.max(0, onboardStep - 1);
      renderOnboarding();
    }
    if (action === "onboard-finish") finishOnboarding();
    if (action === "open-mobile-menu") openMobileMenu();
    if (action === "close-mobile-menu") document.getElementById("v60MobileSheet")?.classList.add("hidden");
  });

  document.addEventListener("change", event => {
    if (event.target.id === "v60Import") {
      const [file] = event.target.files || [];
      importJson(file);
      event.target.value = "";
    }
  });

  document.addEventListener("click", event => {
    if (event.target.id === "v60MobileSheet") {
      event.target.classList.add("hidden");
    }
  });

  ensureOverlay();
  render();
  if (!hadCurrentState && !legacy && !state.meta.onboardingComplete) {
    requestAnimationFrame(() => openOnboarding(true));
  }

  window.GrowthOSV60 = {
    version: SCHEMA_VERSION,
    normalizeSnapshot,
    metrics: managementMetrics,
    exportJson,
    openOnboarding
  };
})();
