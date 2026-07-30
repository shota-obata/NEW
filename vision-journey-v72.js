;(() => {
  "use strict";
  if (window.__growthVisionJourneyV72 || !window.GrowthTeamCore) return;
  window.__growthVisionJourneyV72 = true;

  const Core = window.GrowthTeamCore;
  const commit = () => window.GrowthTeam?.commitState
    ? window.GrowthTeam.commitState()
    : save();
  const safeText = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  const list = value => Array.isArray(value) ? value : [];
  const DOMAIN = Core.DOMAIN_META;
  const DOMAIN_IDS = ["technical", "service", "human", "autonomy"];
  const TYPE_LABELS = {
    Foundation: "土台",
    Critical: "必須",
    Diagnostic: "診断",
    Required: "ルート",
    Optional: "選択",
    Transfer: "転用",
    Integration: "統合"
  };
  let journeyPreview = null;

  function visionProfile() {
    state.visionProfile = Core.normalizeVisionProfile(state.visionProfile, state);
    return state.visionProfile;
  }

  function meaningfulVision() {
    return state.vision &&
      !String(state.vision).includes("設定してください") &&
      String(state.vision).trim().length >= 6;
  }

  function currentCheckpoint() {
    const checkpoints = list(state.journey?.checkpoints);
    return checkpoints.find(item => item.id === state.journey?.currentCheckpointId) ||
      checkpoints.find(item => item.status === "current") ||
      checkpoints.find(item => item.status !== "done" && item.status !== "optional") ||
      checkpoints[0] ||
      null;
  }

  function ensureV72Data() {
    const profile = visionProfile();
    state.meta = state.meta || {};
    if (profile.version >= 2) state.meta.visionVersion = 2;
    const canGenerate = Boolean(state.meta.onboardingComplete && meaningfulVision());
    if (canGenerate && Core.isDefaultJourney(state.journey)) {
      state.journey = Core.createPersonalJourney(state);
      state.currentQuestion = Core.normalizeCurrentQuestion({
        text: currentCheckpoint()?.issue || state.currentQuestion?.text || "",
        checkpointId: currentCheckpoint()?.id || "",
        successConditions: list(currentCheckpoint()?.successConditions),
        updatedAt: Core.isoNow()
      }, state, list(state.journey?.checkpoints));
      state.issue = Object.assign({}, state.currentQuestion, { title: state.currentQuestion.text });
      commit();
    }
  }

  function ensureVisionPage() {
    let page = document.getElementById("vision");
    if (!page) {
      page = document.createElement("section");
      page.id = "vision";
      page.className = "page";
      document.querySelector(".shell > main")?.appendChild(page);
    }
    return page;
  }

  function ensureVisionNavigation() {
    const side = document.getElementById("side");
    if (side && !side.querySelector('[data-page="vision"]')) {
      const button = document.createElement("button");
      button.className = "nav";
      button.dataset.page = "vision";
      button.textContent = "Vision";
      const journeyButton = side.querySelector('[data-page="journey"]');
      side.insertBefore(button, journeyButton || side.firstChild);
    }
    const bottom = document.querySelector(".bottom");
    if (bottom && !bottom.querySelector('[data-page="vision"]')) {
      const button = document.createElement("button");
      button.dataset.page = "vision";
      button.textContent = "Vision";
      const journeyButton = bottom.querySelector('[data-page="journey"]');
      bottom.insertBefore(button, journeyButton || bottom.firstChild);
    }
  }

  function domainValue(profile, domain) {
    return profile[`${domain}Identity`] || (
      domain === "technical" ? "どの技術で、どんな仕上がりをつくるか" :
      domain === "service" ? "お客様にどんな体験と感情を届けるか" :
      domain === "human" ? "どんな判断姿勢と人間性で信頼されるか" :
      "自分で問いを立て、学び続けられるか"
    );
  }

  function visionCompletion(profile) {
    const checks = [
      profile.statement && !profile.statement.includes("設定してください"),
      profile.targetCustomers,
      profile.customerValue,
      profile.technicalIdentity,
      profile.serviceIdentity,
      profile.humanIdentity,
      profile.autonomyIdentity,
      profile.avoidVision,
      profile.arrivalDefinition,
      profile.values.length
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }

  function renderVisionV72() {
    const root = ensureVisionPage();
    if (state.page !== "vision") return;
    const profile = visionProfile();
    const completion = visionCompletion(profile);
    const days = state.deadline
      ? Math.max(0, Math.ceil((new Date(`${state.deadline}T23:59:59`) - new Date()) / 86400000))
      : 0;
    const priorities = profile.priorityOrder.map((id, index) => `
      <span class="v72-priority"><b>${index + 1}</b>${safeText(DOMAIN[id]?.label || id)}</span>
    `).join("");
    root.innerHTML = `
      <header class="v72-pagehead">
        <div>
          <div class="eyebrow">VISION DESIGN / DESTINATION</div>
          <h1>完成像を、成長の設計条件へ。</h1>
          <p class="lead">理想を一文で終わらせず、誰に・何を・どう届けるかまで言語化します。</p>
        </div>
        <div class="v72-head-actions">
          <button class="btn secondary" data-v72-action="edit-vision">Visionを編集</button>
          <button class="btn primary" data-v72-action="preview-journey">Journeyを再設計</button>
        </div>
      </header>
      <section class="v72-vision-hero">
        <div class="v72-vision-copy">
          <span>MY VISION</span>
          <h2>${safeText(profile.statement)}</h2>
          <p>${safeText(profile.customerValue || "お客様へ届けたい価値を設定してください")}</p>
          <div class="v72-value-row">
            ${profile.values.length
              ? profile.values.map(value => `<i>${safeText(value)}</i>`).join("")
              : `<button type="button" class="v72-value-add" data-v72-action="edit-vision">
                  <span>＋</span>価値観を追加
                </button>`}
          </div>
        </div>
        <div class="v72-vision-time">
          <div class="v72-ring" style="--p:${completion}"><b>${completion}%</b><small>解像度</small></div>
          <dl>
            <div><dt>到達期限</dt><dd>${safeText(state.deadline || "未設定")}</dd></div>
            <div><dt>残り</dt><dd>${days}日</dd></div>
            <div><dt>時間境界</dt><dd>${Number(state.hours) || 0}h / 週</dd></div>
          </dl>
        </div>
      </section>
      <section class="v72-section-head">
        <div><span>VISION DOMAINS</span><h2>4つの姿を、一つの美容師像へ。</h2></div>
        <div class="v72-priority-row">${priorities}</div>
      </section>
      <div class="v72-domain-grid">
        ${DOMAIN_IDS.map((domain, index) => `
          <article class="v72-domain-card" style="--domain:${DOMAIN[domain].color}">
            <header><i>${index + 1}</i><span>${safeText(DOMAIN[domain].label)}</span></header>
            <h3>${safeText(domainValue(profile, domain))}</h3>
            <small>${index === 0 ? "優先順位はVision編集で変更できます" : "Journeyで他領域と接続します"}</small>
          </article>
        `).join("")}
      </div>
      <div class="v72-vision-details">
        <section class="card">
          <div class="title">WHO / FOR WHOM</div>
          <h3>${safeText(profile.targetCustomers || "選ばれたいお客様像を設定してください")}</h3>
          <p>${safeText(profile.customerValue || "その人に持ち帰ってほしい価値を設定してください")}</p>
        </section>
        <section class="card">
          <div class="title">ARRIVAL DEFINITION</div>
          <h3>期限日に何が起きていれば、到達と言えるか。</h3>
          <p>${safeText(profile.arrivalDefinition || "観測できる行動で到達状態を定義してください")}</p>
        </section>
        <section class="card v72-avoid">
          <div class="title">NOT TO BE</div>
          <h3>目指さない姿</h3>
          <p>${safeText(profile.avoidVision || "避けたい働き方・接客・技術姿勢を設定してください")}</p>
        </section>
      </div>
      ${profile.tradeoffs.length ? `
        <section class="v72-tradeoffs card">
          <div class="title">TRADE-OFF DECISIONS</div>
          <h2>価値が衝突した時の判断。</h2>
          ${profile.tradeoffs.map(item => `
            <div><b>${safeText(item.question)}</b><span>${safeText(item.choice)}</span><p>${safeText(item.reason)}</p></div>
          `).join("")}
        </section>
      ` : ""}
    `;
  }

  function checkpointProgress(checkpoint) {
    const required = list(checkpoint.evidenceRequirements);
    const actualEvidence = list(checkpoint.evidenceItems).length;
    const evidenceProgress = required.length
      ? Math.min(100, Math.round(actualEvidence / required.length * 100))
      : 0;
    const hourProgress = Number(checkpoint.hours)
      ? Math.min(100, Math.round((Number(checkpoint.actual) || 0) / Number(checkpoint.hours) * 100))
      : 0;
    if (checkpoint.status === "done") return 100;
    return Math.round((evidenceProgress + hourProgress + Number(checkpoint.confidence || 0)) / 3);
  }

  function journeyHealth() {
    const checkpoints = list(state.journey?.checkpoints).filter(item => item.type !== "Optional");
    const requiredHours = checkpoints.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
    const actualHours = checkpoints.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
    const actual = requiredHours ? Math.min(100, Math.round(actualHours / requiredHours * 100)) : 0;
    const hasGeneratedAt = Boolean(state.journey?.generatedFrom?.generatedAt);
    const generated = hasGeneratedAt
      ? new Date(state.journey.generatedFrom.generatedAt)
      : new Date();
    const deadline = state.deadline ? new Date(`${state.deadline}T23:59:59`) : null;
    const totalTime = deadline ? Math.max(1, deadline - generated) : 1;
    const elapsed = deadline ? Math.max(0, Math.min(totalTime, Date.now() - generated)) : 0;
    const planned = hasGeneratedAt && deadline
      ? Math.round(elapsed / totalTime * 100)
      : Math.max(0, Math.min(100, Number(state.planned) || 0));
    const remainingHours = Math.max(0, requiredHours - actualHours);
    const weeks = deadline ? Math.max(1, (deadline - Date.now()) / 604800000) : 1;
    const needPerWeek = remainingHours / weeks;
    const capacity = Number(state.hours) || 0;
    const gap = actual - planned;
    return {
      actual,
      planned,
      gap,
      requiredHours,
      actualHours,
      remainingHours,
      needPerWeek,
      capacity,
      feasible: capacity >= needPerWeek,
      days: deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 86400000)) : 0
    };
  }

  function routeTypeClass(type) {
    return `type-${String(type || "Required").toLowerCase()}`;
  }

  function renderJourneyV72() {
    const root = document.getElementById("journey");
    if (!root || state.page !== "journey") return;
    const profile = visionProfile();
    const health = journeyHealth();
    const checkpoints = list(state.journey?.checkpoints).slice().sort((a, b) =>
      (Number(a.order) || 0) - (Number(b.order) || 0)
    );
    const current = currentCheckpoint();
    const domains = list(state.journey?.domains).length
      ? state.journey.domains
      : DOMAIN_IDS.map(id => ({ id, label: DOMAIN[id].label, color: DOMAIN[id].color }));
    root.innerHTML = `
      <header class="v72-pagehead">
        <div>
          <div class="eyebrow">LIVING BACKCAST MAP</div>
          <h1>Visionから逆算した、期限付きの地図。</h1>
          <p class="lead">Journeyは評価表ではありません。次にどの判断を獲得するかを示すルートです。</p>
        </div>
        <div class="v72-head-actions">
          <button class="btn secondary" data-page="vision">Visionを確認</button>
          <button class="btn primary" data-v72-action="preview-journey">ルートを再設計</button>
        </div>
      </header>
      <section class="v72-journey-destination">
        <div>
          <span>DESTINATION / ${safeText(state.deadline || "期限未設定")}</span>
          <h2>${safeText(profile.statement)}</h2>
          <p>${safeText(profile.arrivalDefinition || "期限日の到達状態をVisionで定義してください")}</p>
        </div>
        <div class="v72-route-health ${health.feasible ? "healthy" : "critical"}">
          <b>${health.actual}%</b>
          <span>計画 ${health.planned}%</span>
          <small>${health.feasible ? "勤務時間内で成立" : "時間設計の見直しが必要"}</small>
        </div>
      </section>
      <div class="v72-journey-metrics">
        <div><span>現在地</span><b>${safeText(current ? `${current.code} ${current.title}` : "未設定")}</b></div>
        <div><span>期限まで</span><b>${health.days}日</b></div>
        <div><span>必要ペース</span><b>${health.needPerWeek.toFixed(1)}h / 週</b></div>
        <div class="${health.gap < -8 ? "warn" : ""}"><span>Schedule Gap</span><b>${health.gap > 0 ? "+" : ""}${health.gap}%</b></div>
      </div>
      <section class="v72-current-map">
        <div class="v72-current-copy">
          <span>CURRENT CHECKPOINT</span>
          <h2>${safeText(current ? `${current.code}｜${current.title}` : "Checkpoint未設定")}</h2>
          <p>${safeText(current?.criteria || "到達条件を設定してください")}</p>
          <div class="v72-current-question">
            <small>今回の問い</small>
            <b>${safeText(state.issue?.title || current?.issue || "今回の問いを設定してください")}</b>
          </div>
          <div class="v72-head-actions">
            ${current ? `<button class="btn primary" data-action="open-checkpoint" data-id="${safeText(current.id)}">Checkpointを開く</button>` : ""}
            <button class="btn secondary" data-page="practice">モデルで検証</button>
          </div>
        </div>
        <div class="v72-current-evidence">
          <span>CHECKPOINT PROGRESS</span>
          <div class="v72-big-progress"><b>${checkpointProgress(current || {})}%</b><i><em style="width:${checkpointProgress(current || {})}%"></em></i></div>
          <dl>
            <div><dt>期限</dt><dd>${safeText(current?.date || "-")}</dd></div>
            <div><dt>Evidence</dt><dd>${list(current?.evidenceItems).length}件</dd></div>
            <div><dt>Support</dt><dd>${list(current?.supportHistory).length}件</dd></div>
          </dl>
        </div>
      </section>
      <section class="v72-map-section">
        <header>
          <div><span>YOUR ROUTE</span><h2>Checkpoint Roadmap</h2></div>
          <div class="v72-domain-legend">
            ${domains.map(domain => `<i style="--domain:${safeText(domain.color || DOMAIN[domain.id]?.color)}">${safeText(domain.label || DOMAIN[domain.id]?.label)}</i>`).join("")}
          </div>
        </header>
        <div class="v72-roadmap">
          ${checkpoints.map((checkpoint, index) => {
            const domain = domains.find(item => item.id === checkpoint.domain) ||
              { label: DOMAIN[checkpoint.domain]?.label || "技術", color: DOMAIN[checkpoint.domain]?.color || "#5b6cf9" };
            return `
              <article class="v72-route-node ${safeText(checkpoint.status)} ${routeTypeClass(checkpoint.type)}" style="--domain:${safeText(domain.color)}">
                <button data-action="open-checkpoint" data-id="${safeText(checkpoint.id)}">
                  <span class="v72-node-order">${checkpoint.status === "done" ? "✓" : safeText(checkpoint.code || index + 1)}</span>
                  <small>${safeText(TYPE_LABELS[checkpoint.type] || checkpoint.type)} · ${safeText(domain.label)}</small>
                  <h3>${safeText(checkpoint.title)}</h3>
                  <time>${safeText(checkpoint.date || "-")}</time>
                  <i><em style="width:${checkpointProgress(checkpoint)}%"></em></i>
                </button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
      <div class="v72-journey-lower">
        <details class="card" open>
          <summary>なぜこの順番なのか <span>＋</span></summary>
          <div class="v72-detail-body">
            <p>${safeText(state.journey?.routeReason || "Visionの優先領域と現在地から、土台→診断→必須判断→転用→統合の順に配置します。")}</p>
            <div class="v72-type-legend">
              ${Object.entries(TYPE_LABELS).map(([type, label]) => `<i class="${routeTypeClass(type)}"><b>${safeText(label)}</b>${safeText(type)}</i>`).join("")}
            </div>
          </div>
        </details>
        <details class="card">
          <summary>時間とズレ <span>＋</span></summary>
          <div class="v72-detail-body">
            <div class="v72-deviation-grid">
              <div><b>Plan</b><span>予定した実践量との差</span></div>
              <div><b>Yield</b><span>得られたEvidence量との差</span></div>
              <div><b>Direction</b><span>Visionへつながらない活動</span></div>
              <div><b>Quality</b><span>自律度・再現性の不足</span></div>
              <div><b>Positive</b><span>予測以上の転用・理解</span></div>
              <div><b>Structural</b><span>Journey仮説そのものの修正</span></div>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  function ensureVisionModal() {
    if (document.getElementById("v72VisionModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="v72-modal hidden" id="v72VisionModal">
        <div class="v72-modalbox">
          <header><div><span>VISION DESIGN</span><h2>美容師像を設計する</h2></div><button class="close" data-v72-action="close-vision">×</button></header>
          <div class="v72-formgrid">
            <label class="wide"><span>私はどんな美容師になるか</span><textarea id="v72Statement"></textarea></label>
            <label><span>誰に選ばれたいか</span><textarea id="v72Customers"></textarea></label>
            <label><span>何を持ち帰ってほしいか</span><textarea id="v72Value"></textarea></label>
            <label><span>技術者として</span><textarea id="v72Technical"></textarea></label>
            <label><span>接客者として</span><textarea id="v72Service"></textarea></label>
            <label><span>人間として</span><textarea id="v72Human"></textarea></label>
            <label><span>自走する人として</span><textarea id="v72Autonomy"></textarea></label>
            <label><span>なりたくない姿</span><textarea id="v72Avoid"></textarea></label>
            <label><span>譲れない価値観（カンマ区切り・最大5つ）</span><input id="v72Values"></label>
            <label class="wide"><span>期限日の到達状態</span><textarea id="v72Arrival"></textarea></label>
            <fieldset class="wide"><legend>優先順位</legend>
              <div class="v72-priority-selects">
                ${[0, 1, 2, 3].map(index => `
                  <label><span>${index + 1}位</span><select id="v72Priority${index}">
                    ${DOMAIN_IDS.map(id => `<option value="${id}">${DOMAIN[id].label}</option>`).join("")}
                  </select></label>
                `).join("")}
              </div>
            </fieldset>
            <label><span>価値が衝突する場面</span><input id="v72TradeoffQuestion" placeholder="例：安心感と新しさが衝突したら？"></label>
            <label><span>その時に選ぶものと理由</span><textarea id="v72TradeoffAnswer"></textarea></label>
          </div>
          <footer><button class="btn secondary" data-v72-action="close-vision">キャンセル</button><button class="btn primary" data-v72-action="save-vision">Vision設計書を保存</button></footer>
        </div>
      </div>
      <div class="v72-modal hidden" id="v72JourneyModal">
        <div class="v72-modalbox v72-route-preview">
          <header><div><span>JOURNEY PREVIEW</span><h2>Visionから逆算した新しいルート</h2></div><button class="close" data-v72-action="close-journey-preview">×</button></header>
          <div id="v72JourneyPreviewBody"></div>
          <footer><button class="btn secondary" data-v72-action="close-journey-preview">今のJourneyを残す</button><button class="btn primary" data-v72-action="adopt-journey">このJourneyを採用</button></footer>
        </div>
      </div>
    `);
  }

  function openVisionEditor() {
    ensureVisionModal();
    const profile = visionProfile();
    const ids = {
      v72Statement: profile.statement,
      v72Customers: profile.targetCustomers,
      v72Value: profile.customerValue,
      v72Technical: profile.technicalIdentity,
      v72Service: profile.serviceIdentity,
      v72Human: profile.humanIdentity,
      v72Autonomy: profile.autonomyIdentity,
      v72Avoid: profile.avoidVision,
      v72Values: profile.values.join("、"),
      v72Arrival: profile.arrivalDefinition,
      v72TradeoffQuestion: profile.tradeoffs[0]?.question || "",
      v72TradeoffAnswer: profile.tradeoffs[0]
        ? `${profile.tradeoffs[0].choice}${profile.tradeoffs[0].reason ? `｜${profile.tradeoffs[0].reason}` : ""}`
        : ""
    };
    Object.entries(ids).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value || "";
    });
    profile.priorityOrder.forEach((id, index) => {
      const select = document.getElementById(`v72Priority${index}`);
      if (select) select.value = id;
    });
    document.getElementById("v72VisionModal").classList.remove("hidden");
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add("hidden");
  }

  function saveVision() {
    const priorities = [0, 1, 2, 3]
      .map(index => document.getElementById(`v72Priority${index}`)?.value)
      .filter(Boolean);
    if (new Set(priorities).size !== priorities.length) {
      alert("優先順位は重複しないように選んでください。");
      return;
    }
    const tradeoffQuestion = document.getElementById("v72TradeoffQuestion").value.trim();
    const tradeoffAnswer = document.getElementById("v72TradeoffAnswer").value.trim();
    const [choice, reason = ""] = tradeoffAnswer.split("｜");
    state.visionProfile = Core.normalizeVisionProfile({
      statement: document.getElementById("v72Statement").value.trim(),
      targetCustomers: document.getElementById("v72Customers").value.trim(),
      customerValue: document.getElementById("v72Value").value.trim(),
      technicalIdentity: document.getElementById("v72Technical").value.trim(),
      serviceIdentity: document.getElementById("v72Service").value.trim(),
      humanIdentity: document.getElementById("v72Human").value.trim(),
      autonomyIdentity: document.getElementById("v72Autonomy").value.trim(),
      avoidVision: document.getElementById("v72Avoid").value.trim(),
      values: document.getElementById("v72Values").value
        .split(/[、,]/)
        .map(value => value.trim())
        .filter(Boolean),
      priorityOrder: priorities,
      tradeoffs: tradeoffQuestion || tradeoffAnswer
        ? [{ question: tradeoffQuestion, choice: choice.trim(), reason: reason.trim() }]
        : [],
      arrivalDefinition: document.getElementById("v72Arrival").value.trim(),
      updatedAt: Core.isoNow()
    }, state);
    state.vision = state.visionProfile.statement;
    state.onboarding = state.onboarding || {};
    state.onboarding.visionValue = state.visionProfile.customerValue;
    state.onboarding.avoidVision = state.visionProfile.avoidVision;
    state.onboarding.arrivalDefinition = state.visionProfile.arrivalDefinition;
    state.meta = Object.assign({}, state.meta || {}, { visionVersion: 2 });
    commit();
    closeModal("v72VisionModal");
    render();
  }

  function previewJourney() {
    ensureVisionModal();
    journeyPreview = Core.createPersonalJourney(state);
    const body = document.getElementById("v72JourneyPreviewBody");
    body.innerHTML = `
      <div class="v72-preview-reason">${safeText(journeyPreview.routeReason)}</div>
      <div class="v72-preview-list">
        ${journeyPreview.checkpoints.map(checkpoint => `
          <article style="--domain:${safeText(DOMAIN[checkpoint.domain]?.color || "#5b6cf9")}">
            <i>${safeText(checkpoint.code)}</i>
            <div><small>${safeText(TYPE_LABELS[checkpoint.type] || checkpoint.type)} · ${safeText(DOMAIN[checkpoint.domain]?.label)}</small><h3>${safeText(checkpoint.title)}</h3><p>${safeText(checkpoint.criteria)}</p></div>
            <time>${safeText(checkpoint.date)}</time>
          </article>
        `).join("")}
      </div>
      ${!Core.isDefaultJourney(state.journey) ? `<div class="v72-replace-warning">現在のJourneyは履歴として保存されます。Evidenceや実績を削除せず、Route Changeへ退避します。</div>` : ""}
    `;
    document.getElementById("v72JourneyModal").classList.remove("hidden");
  }

  function adoptJourney() {
    if (!journeyPreview) return;
    const previous = JSON.parse(JSON.stringify(state.journey || {}));
    const priorChanges = list(previous.routeChanges);
    previous.routeChanges = [];
    journeyPreview.routeChanges = [
      ...priorChanges,
      {
        id: Core.uid("route-change", Date.now()),
        at: Core.isoNow(),
        reason: "Vision設計書からJourneyを再生成",
        previous
      }
    ];
    state.journey = journeyPreview;
    const current = currentCheckpoint();
    state.currentQuestion = Core.normalizeCurrentQuestion({
      text: current?.issue || "",
      checkpointId: current?.id || "",
      successConditions: list(current?.successConditions),
      updatedAt: Core.isoNow()
    }, state, list(state.journey?.checkpoints));
    state.issue = Object.assign({}, state.currentQuestion, { title: state.currentQuestion.text });
    journeyPreview = null;
    commit();
    closeModal("v72JourneyModal");
    state.page = "journey";
    render();
  }

  function unlockNextCheckpoint() {
    const checkpoints = list(state.journey?.checkpoints);
    const currentIndex = checkpoints.findIndex(item => item.status === "current");
    if (currentIndex < 0) return;
    const next = checkpoints.slice(currentIndex + 1)
      .find(item => item.status === "locked" && item.type !== "Optional");
    if (next) next.status = "next";
    state.journey.currentCheckpointId = checkpoints[currentIndex].id;
  }

  const previousRender = render;
  render = function renderV72() {
    ensureV72Data();
    previousRender();
    ensureVisionPage();
    ensureVisionNavigation();
    renderVisionV72();
    renderJourneyV72();
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.id === state.page);
    });
    document.querySelectorAll("[data-page]").forEach(button => {
      if (button.classList.contains("nav")) {
        button.classList.toggle("active", button.dataset.page === state.page);
      }
    });
    const versionLabel = `v${window.GROWTH_VERSION || "7.9"}`;
    document.title = `Growth OS ${versionLabel}`;
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = versionLabel;
  };

  document.addEventListener("click", event => {
    const action = event.target.closest("[data-v72-action]")?.dataset.v72Action;
    if (!action) return;
    if (action === "edit-vision") openVisionEditor();
    if (action === "close-vision") closeModal("v72VisionModal");
    if (action === "save-vision") saveVision();
    if (action === "preview-journey") previewJourney();
    if (action === "close-journey-preview") closeModal("v72JourneyModal");
    if (action === "adopt-journey") adoptJourney();
  });

  document.addEventListener("click", event => {
    if (!event.target.closest('[data-action="complete-checkpoint"], [data-action="set-current-checkpoint"]')) return;
    setTimeout(() => {
      unlockNextCheckpoint();
      commit();
      render();
    }, 0);
  });

  ensureVisionModal();
  ensureV72Data();
  render();
})();
