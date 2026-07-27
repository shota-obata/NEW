;(() => {
  "use strict";
  if (window.__growthSupportV73 || !window.GrowthTeamCore) return;
  window.__growthSupportV73 = true;

  const Core = window.GrowthTeamCore;
  const GAP_TYPES = [
    { id: "recognition", label: "観察・認識", short: "見えていない", hint: "骨格・髪質・顧客の言葉など、判断に必要な情報を拾えているか。" },
    { id: "criteria", label: "判断基準", short: "基準が曖昧", hint: "何を根拠に良否や基準点を決めるか、条件が言語化されているか。" },
    { id: "planning", label: "設計", short: "構造化できない", hint: "完成像を長さ・位置・順序・接続へ変換できているか。" },
    { id: "execution", label: "操作", short: "実行が一致しない", hint: "設計した内容を身体操作や会話へ正確に変換できているか。" },
    { id: "verification", label: "確認・修正", short: "誤差を戻せない", hint: "途中で差を検知し、原因を逆算して修正できているか。" },
    { id: "transfer", label: "条件転用", short: "条件が変わると崩れる", hint: "異なる骨格・髪質・顧客・場面でも判断原則を使えるか。" },
    { id: "service", label: "顧客理解・提案", short: "体験へ変換できない", hint: "要望・不安・背景を理解し、合意できる提案へ変換できているか。" },
    { id: "human", label: "報告・判断姿勢", short: "自立を止める", hint: "不確実さを認識し、相談・決断・振り返りを適切に行えているか。" }
  ];
  const TYPE_LABELS = {
    Foundation: "土台",
    Critical: "必須",
    Diagnostic: "診断",
    Required: "ルート",
    Optional: "選択",
    Transfer: "転用",
    Integration: "統合"
  };
  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  const list = value => Array.isArray(value) ? value : [];
  const stamp = () => new Date().toLocaleString("ja-JP", { hour12: false });
  const isoNow = () => Core.isoNow ? Core.isoNow() : new Date().toISOString();

  function currentCheckpoint() {
    const checkpoints = list(state.journey?.checkpoints);
    return checkpoints.find(item => item.id === state.journey?.currentCheckpointId) ||
      checkpoints.find(item => item.status === "current") ||
      checkpoints.find(item => item.status !== "done" && item.status !== "optional") ||
      checkpoints[0] ||
      null;
  }

  function profile() {
    return Core.normalizeVisionProfile
      ? Core.normalizeVisionProfile(state.visionProfile, state)
      : Object.assign({ statement: state.vision || "", arrivalDefinition: "" }, state.visionProfile || {});
  }

  function actor() {
    const context = window.GrowthTeam?.actorContext?.() || {};
    return {
      actorId: context.actorId || "",
      actorName: context.actorName || "Support",
      actorRole: context.actorRole || state.role || "support",
      staffId: context.staffId || state.staffId || ""
    };
  }

  function staffMember() {
    return window.GrowthTeam?.activeStaff?.() || {
      id: actor().staffId,
      name: state.staffName || "Staff",
      initial: "S"
    };
  }

  function evidenceRequirements(checkpoint) {
    const direct = list(checkpoint?.evidenceRequirements).filter(Boolean);
    if (direct.length) return direct;
    return String(checkpoint?.evidence || "")
      .split(/\s*\/\s*|\n+|、/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function successConditions(checkpoint) {
    const direct = list(state.issue?.successConditions).filter(Boolean);
    if (direct.length) return direct;
    const checkpointConditions = list(checkpoint?.successConditions).filter(Boolean);
    if (checkpointConditions.length) return checkpointConditions;
    return String(checkpoint?.criteria || "")
      .split(/\n+|。/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function evidenceCoverage(checkpoint) {
    const required = evidenceRequirements(checkpoint);
    const actual = list(checkpoint?.evidenceItems);
    return {
      required,
      actual,
      missing: Math.max(0, required.length - actual.length),
      percent: required.length
        ? Math.min(100, Math.round(actual.length / required.length * 100))
        : actual.length ? 100 : 0
    };
  }

  function recommendedGap(checkpoint) {
    const domain = checkpoint?.domain || "technical";
    if (domain === "service") return "service";
    if (domain === "human") return "human";
    if (domain === "autonomy") return "verification";
    if (checkpoint?.type === "Transfer") return "transfer";
    if (checkpoint?.type === "Diagnostic") return "recognition";
    return "criteria";
  }

  function supportSessionsFor(checkpoint) {
    return list(state.supportSessions)
      .filter(item => !checkpoint || item.checkpointId === checkpoint.id)
      .slice()
      .reverse();
  }

  function relatedAssets(checkpoint) {
    const staffId = actor().staffId;
    const terms = [
      checkpoint?.title,
      checkpoint?.domain,
      state.issue?.title
    ].filter(Boolean).map(value => String(value).toLowerCase());
    return list(state.library)
      .filter(asset => {
        const staffIds = list(asset.staffIds);
        const allowed = !staffIds.length || !staffId || staffIds.includes(staffId);
        const haystack = [
          asset.title, asset.tag, asset.case, asset.decision,
          asset.correction, asset.rule, asset.next, asset.domain
        ].filter(Boolean).join(" ").toLowerCase();
        return allowed && terms.some(term => term && haystack.includes(term));
      })
      .slice(0, 3);
  }

  function field(root, id) {
    return root.querySelector(`#${id}`)?.value?.trim() || "";
  }

  function selectedGap(root) {
    return root.dataset.gap ||
      root.querySelector(".v73-gap.active")?.dataset.gap ||
      recommendedGap(currentCheckpoint());
  }

  function draft(root) {
    const checkpoint = currentCheckpoint();
    const context = actor();
    const gapType = selectedGap(root);
    const gap = GAP_TYPES.find(item => item.id === gapType) || GAP_TYPES[1];
    const conditions = field(root, "v73SuccessConditions")
      .split("\n")
      .map(item => item.trim())
      .filter(Boolean);
    const issueBefore = state.issue?.title || checkpoint?.issue || "";
    return {
      id: Core.uid ? Core.uid("support", `${Date.now()}-${Math.random()}`) : `support-${Date.now()}`,
      version: 2,
      staffId: context.staffId,
      supportId: context.actorId,
      supportName: context.actorName,
      actorId: context.actorId,
      actorName: context.actorName,
      actorRole: context.actorRole,
      checkpointId: checkpoint?.id || "",
      checkpointCode: checkpoint?.code || "",
      checkpointTitle: checkpoint?.title || "",
      checkpointType: checkpoint?.type || "",
      domain: checkpoint?.domain || "",
      visionSnapshot: profile().statement || state.vision || "",
      issue: issueBefore,
      issueBefore,
      gapType,
      gapLabel: gap.label,
      compare: field(root, "v73Compare"),
      comparison: field(root, "v73Compare"),
      diagnosis: field(root, "v73Diagnosis"),
      correction: field(root, "v73Correction"),
      supportQuestion: field(root, "v73SupportQuestion"),
      next: field(root, "v73NextIssue"),
      nextIssue: field(root, "v73NextIssue"),
      successConditions: conditions,
      nextCondition: field(root, "v73NextCondition"),
      transferRule: field(root, "v73TransferRule"),
      by: context.actorName,
      at: stamp(),
      createdAt: isoNow()
    };
  }

  function validateDraft(value) {
    const missing = [];
    if (!value.comparison) missing.push("比較");
    if (!value.diagnosis) missing.push("原因仮説");
    if (!value.correction) missing.push("判断修正");
    if (!value.nextIssue) missing.push("次の問い");
    if (!value.successConditions.length) missing.push("今回の成功条件");
    return missing;
  }

  function libraryAsset(value) {
    const checkpoint = currentCheckpoint();
    const context = actor();
    const assetId = Core.uid
      ? Core.uid("support-asset", `${Date.now()}-${Math.random()}`)
      : `support-asset-${Date.now()}`;
    return {
      id: assetId,
      title: `${checkpoint?.title || "Checkpoint"}｜${value.gapLabel}の判断修正`,
      tag: `Support / ${checkpoint?.domain || "growth"}`,
      case: `${value.issueBefore}\n\n比較：${value.comparison}`,
      decision: value.diagnosis,
      correction: value.correction,
      rule: value.transferRule || value.supportQuestion,
      next: `${value.nextIssue}${value.nextCondition ? `\n条件：${value.nextCondition}` : ""}`,
      image: "",
      checkpointId: value.checkpointId,
      checkpointCode: value.checkpointCode,
      domain: value.domain,
      gapType: value.gapType,
      gapLabel: value.gapLabel,
      sourceSupportId: value.id,
      successConditions: value.successConditions,
      staffIds: value.staffId ? [value.staffId] : [],
      updatedBy: context.actorName,
      updatedById: context.actorId,
      updatedAt: stamp(),
      history: [{
        at: value.at,
        by: context.actorName,
        byId: context.actorId,
        role: context.actorRole,
        staffId: value.staffId,
        action: "Support判断から資産化"
      }]
    };
  }

  function saveDecision(mode) {
    const root = document.getElementById("support");
    const checkpoint = currentCheckpoint();
    if (!root || !checkpoint) return;
    const value = draft(root);
    const missing = validateDraft(value);
    if (missing.length) {
      alert(`${missing.join("・")}を入力してください。`);
      return;
    }

    value.mode = mode;
    state.supportSessions = list(state.supportSessions);
    checkpoint.supportHistory = list(checkpoint.supportHistory);
    checkpoint.history = list(checkpoint.history);
    state.journey.history = list(state.journey?.history);
    state.supportSessions.push(value);
    checkpoint.supportHistory.push(value);
    checkpoint.history.push({
      at: value.at,
      by: value.by,
      action: "Support判断修正",
      detail: `${value.gapLabel}｜${value.nextIssue}`
    });
    state.journey.history.push({
      at: value.at,
      by: value.by,
      action: "Support判断修正",
      detail: `${value.checkpointCode} ${value.gapLabel}`
    });

    if (mode === "apply" || mode === "library") {
      state.issue = Object.assign({}, state.issue || {}, {
        title: value.nextIssue,
        previousTitle: value.issueBefore,
        gapType: value.gapType,
        gapLabel: value.gapLabel,
        successConditions: value.successConditions,
        nextCondition: value.nextCondition,
        supportQuestion: value.supportQuestion,
        updatedAt: value.createdAt,
        updatedBy: value.supportName
      });
      checkpoint.issue = value.nextIssue;
      checkpoint.successConditions = value.successConditions;
      checkpoint.nextCondition = value.nextCondition;
      checkpoint.gapType = value.gapType;
      checkpoint.updatedAt = value.createdAt;
    }

    if (mode === "library") {
      const asset = libraryAsset(value);
      value.libraryAssetId = asset.id;
      state.library = list(state.library);
      state.library.unshift(asset);
      state.libraryRefs = Array.from(new Set([...list(state.libraryRefs), asset.id]));
    }

    save();
    render();
  }

  function sessionDetail(value) {
    const compare = value.comparison || value.compare || "-";
    const next = value.nextIssue || value.next || value.issue || "次の問い未設定";
    const conditions = list(value.successConditions);
    return `
      <details class="v73-history-item">
        <summary>
          <span class="v73-history-dot"></span>
          <span><b>${safe(next)}</b><small>${safe(value.supportName || value.by || "Support")}・${safe(value.at || value.createdAt || "")}</small></span>
          <i>${safe(value.gapLabel || "判断修正")}</i>
        </summary>
        <div class="v73-history-detail">
          <dl>
            <div><dt>比較</dt><dd>${safe(compare)}</dd></div>
            <div><dt>原因仮説</dt><dd>${safe(value.diagnosis || "-")}</dd></div>
            <div><dt>判断修正</dt><dd>${safe(value.correction || "-")}</dd></div>
            <div><dt>成功条件</dt><dd>${conditions.length ? conditions.map(item => `・${safe(item)}`).join("<br>") : "-"}</dd></div>
          </dl>
        </div>
      </details>
    `;
  }

  function renderSupportV73() {
    const root = document.getElementById("support");
    if (!root || state.page !== "support") return;
    const checkpoint = currentCheckpoint();
    const vision = profile();
    const context = actor();
    const staff = staffMember();
    const coverage = evidenceCoverage(checkpoint);
    const sessions = supportSessionsFor(checkpoint);
    const assets = relatedAssets(checkpoint);
    const defaultGap = recommendedGap(checkpoint);
    root.dataset.gap = defaultGap;
    const conditions = successConditions(checkpoint);
    const initials = value => safe(String(value || "?").slice(0, 1).toUpperCase());

    root.innerHTML = `
      <header class="v73-pagehead">
        <div>
          <div class="eyebrow">SUPPORT / JUDGMENT CORRECTION</div>
          <h1>答えではなく、判断を修正する。</h1>
          <p class="lead">不足を人格評価にせず、Vision到達を止めている判断構造を次の検証へ変えます。</p>
        </div>
        <div class="v73-actor">
          <span class="v73-mini-avatar support">${initials(context.actorName)}</span>
          <div><small>SUPPORT</small><b>${safe(context.actorName)}</b></div>
          <i>→</i>
          <span class="v73-mini-avatar">${initials(staff.name)}</span>
          <div><small>STAFF</small><b>${safe(staff.name)}</b></div>
        </div>
      </header>

      <section class="v73-path">
        <div class="v73-path-vision">
          <span>VISION</span>
          <b>${safe(vision.statement || state.vision || "Vision未設定")}</b>
        </div>
        <i>›</i>
        <div>
          <span>${safe(TYPE_LABELS[checkpoint?.type] || checkpoint?.type || "CHECKPOINT")}</span>
          <b>${safe(checkpoint ? `${checkpoint.code || ""} ${checkpoint.title || ""}` : "未設定")}</b>
        </div>
        <i>›</i>
        <div class="v73-path-issue">
          <span>ISSUE A / 今回の問い</span>
          <b>${safe(state.issue?.title || checkpoint?.issue || "未設定")}</b>
        </div>
      </section>

      <div class="v73-layout">
        <main class="v73-main">
          <section class="v73-workspace">
            <header>
              <div>
                <span>01 / COMPARE</span>
                <h2>到達条件とEvidenceの差は何か。</h2>
              </div>
              <div class="v73-coverage"><b>${coverage.percent}%</b><small>EVIDENCE COVERAGE</small></div>
            </header>
            <div class="v73-criteria">
              <div><span>到達条件</span><p>${safe(checkpoint?.criteria || "未設定")}</p></div>
              <div><span>次へ進む理由</span><p>${safe(checkpoint?.routeReason || "このCheckpointの役割をJourneyで確認してください。")}</p></div>
            </div>
            <label class="v73-field">
              <span>期待した判断と、実際の判断を並べる</span>
              <textarea id="v73Compare" placeholder="例：完成像では頬骨下が最短点。実際は現在の毛先を基準に決め、骨格が変わると判断も変わった。"></textarea>
            </label>
          </section>

          <section class="v73-workspace">
            <header><div><span>02 / DIAGNOSE</span><h2>どのGapが、成長を止めているか。</h2></div></header>
            <div class="v73-gap-grid">
              ${GAP_TYPES.map(item => `
                <button class="v73-gap ${item.id === defaultGap ? "active" : ""}" data-v73-action="select-gap" data-gap="${item.id}">
                  <span>${safe(item.label)}</span><b>${safe(item.short)}</b><small>${safe(item.hint)}</small>
                </button>
              `).join("")}
            </div>
            <label class="v73-field">
              <span>原因仮説｜なぜその判断になったか</span>
              <textarea id="v73Diagnosis" placeholder="表面的な失敗ではなく、観察→解釈→設計→操作→確認のどこで因果が切れたか。"></textarea>
            </label>
          </section>

          <section class="v73-workspace">
            <header><div><span>03 / CORRECT</span><h2>Supportが修正するのは、判断基準です。</h2></div></header>
            <div class="v73-two-fields">
              <label class="v73-field">
                <span>判断修正｜次回は何を基準にするか</span>
                <textarea id="v73Correction" placeholder="例：現在の長さからではなく、完成像・骨格・落ち位置の3条件から最短点を決める。"></textarea>
              </label>
              <label class="v73-field">
                <span>本人に返す問い｜答えを渡さず何を聞くか</span>
                <textarea id="v73SupportQuestion" placeholder="例：その最短点は、完成像のどの情報から決めた？"></textarea>
              </label>
            </div>
            <label class="v73-field">
              <span>転用ルール｜別条件でも使える原則</span>
              <textarea id="v73TransferRule" class="v73-small-textarea" placeholder="例：基準点は現状の毛先ではなく、完成像と条件から逆算する。"></textarea>
            </label>
          </section>

          <section class="v73-workspace v73-next">
            <header><div><span>04 / NEXT TEST</span><h2>次のモデルで、答えられる問いにする。</h2></div></header>
            <label class="v73-field">
              <span>次のIssue A｜今回の問い</span>
              <textarea id="v73NextIssue" class="v73-small-textarea" placeholder="例：異なる骨格でも、完成像から最短点と最長点を自力で設定できるか。">${safe(state.issue?.title || checkpoint?.issue || "")}</textarea>
            </label>
            <div class="v73-two-fields">
              <label class="v73-field">
                <span>今回の成功条件｜1行に1つ</span>
                <textarea id="v73SuccessConditions" placeholder="切る前に基準点と理由を説明できる&#10;Supportの位置指示なしで再現できる&#10;異なる骨格で判断を修正できる">${safe(conditions.join("\n"))}</textarea>
              </label>
              <label class="v73-field">
                <span>次に試す条件｜モデル・骨格・髪質・接客場面</span>
                <textarea id="v73NextCondition" placeholder="例：面長・直毛のカットモデル。施術前に正面と側面へ基準点を書き込む。"></textarea>
              </label>
            </div>
          </section>

          <footer class="v73-actions">
            <button class="btn secondary" data-v73-action="save">判断修正を保存</button>
            <button class="btn secondary" data-v73-action="library">Libraryへ資産化</button>
            <button class="btn primary" data-v73-action="apply">次のIssueへ反映</button>
          </footer>
        </main>

        <aside class="v73-side">
          <section class="v73-sidecard">
            <header><span>EVIDENCE</span><b>${coverage.actual.length} / ${coverage.required.length || "–"}</b></header>
            <div class="v73-mini-progress"><i style="width:${coverage.percent}%"></i></div>
            <h3>必要なEvidence</h3>
            <ul class="v73-evidence-list">
              ${coverage.required.length
                ? coverage.required.map((item, index) => `<li class="${index < coverage.actual.length ? "done" : ""}"><i>${index < coverage.actual.length ? "✓" : ""}</i>${safe(item)}</li>`).join("")
                : "<li><i></i>Checkpointで必要Evidenceを設定</li>"}
            </ul>
            <h3>登録済み</h3>
            <div class="v73-evidence-actual">
              ${coverage.actual.length
                ? coverage.actual.slice(-5).reverse().map(item => `<span><b>${safe(item.title || "Evidence")}</b><small>${safe(item.by || "")} ${safe(item.at || "")}</small></span>`).join("")
                : "<p>まだEvidenceがありません。</p>"}
            </div>
            <button class="btn secondary" data-action="open-checkpoint" data-id="${safe(checkpoint?.id || "")}">Checkpointを開く</button>
          </section>

          <section class="v73-sidecard">
            <header><span>LIBRARY MATCH</span><b>${assets.length}</b></header>
            <p>同じ判断を一から考えず、過去の修正と転用ルールを使います。</p>
            <div class="v73-asset-list">
              ${assets.length
                ? assets.map(asset => `<button data-page="library"><span>${safe(asset.tag || "Library")}</span><b>${safe(asset.title)}</b></button>`).join("")
                : "<div class=\"v73-empty\">関連資産はまだありません。</div>"}
            </div>
            <button class="btn secondary" data-page="library">Libraryを検索</button>
          </section>

          <section class="v73-principle">
            <span>SUPPORT PRINCIPLE</span>
            <h3>本人の不足を責めず、次に変えられる判断へ。</h3>
            <p>Supportの成果は、答えた回数ではなく、本人が次の条件で自力判断できたかで確認します。</p>
          </section>
        </aside>
      </div>

      <section class="v73-history">
        <header><div><span>DECISION HISTORY</span><h2>判断がどう変わったか。</h2></div><b>${sessions.length} records</b></header>
        <div>${sessions.length ? sessions.map(sessionDetail).join("") : "<div class=\"v73-empty-history\">まだ判断修正の履歴はありません。</div>"}</div>
      </section>
    `;
  }

  const previousRender = render;
  render = function renderV73() {
    previousRender();
    renderSupportV73();
    document.title = "Growth OS v7.3";
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = "v7.3";
  };

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-v73-action]");
    if (!button) return;
    const root = document.getElementById("support");
    if (!root) return;
    const action = button.dataset.v73Action;
    if (action === "select-gap") {
      root.dataset.gap = button.dataset.gap;
      root.querySelectorAll(".v73-gap").forEach(item => {
        item.classList.toggle("active", item === button);
      });
      return;
    }
    if (action === "save") saveDecision("save");
    if (action === "apply") saveDecision("apply");
    if (action === "library") saveDecision("library");
  });

  render();
})();
