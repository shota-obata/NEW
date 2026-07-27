;(function attachGrowthTeamCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GrowthTeamCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGrowthTeamCore() {
  "use strict";

  const SCHEMA_VERSION = 7;
  const WORKSPACE_KEYS = [
    "vision", "visionProfile", "deadline", "hours", "overtimeHours", "focusArea",
    "progress", "planned", "issue", "journey", "modelBookings",
    "practiceSessions", "supportSessions", "practiceDraft", "libraryUi",
    "libraryRefs", "onboarding", "meta"
  ];

  function clone(value) {
    if (value === undefined) return undefined;
    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uid(prefix, seed) {
    const suffix = String(seed || Date.now()).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    return `${prefix}-${suffix || Math.random().toString(36).slice(2, 10)}`;
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function initialFor(name, fallback) {
    const text = String(name || "").trim();
    return text ? text.slice(0, 1).toUpperCase() : fallback;
  }

  function createMember(role, values) {
    const now = values?.createdAt || isoNow();
    const name = String(values?.name || (
      role === "staff" ? "新しいStaff" :
      role === "support" ? "Support" : "Management"
    )).trim();
    return {
      id: values?.id || uid(role, `${name}-${now}-${Math.random()}`),
      name,
      role,
      avatar: values?.avatar || "",
      initial: values?.initial || initialFor(name, role.slice(0, 1).toUpperCase()),
      status: values?.status === "archived" ? "archived" : "active",
      createdAt: now,
      updatedAt: values?.updatedAt || now,
      responsibility: values?.responsibility || "",
      staffIds: asArray(values?.staffIds).slice(),
      primarySupportId: values?.primarySupportId || "",
      supportMemberIds: asArray(values?.supportMemberIds).slice()
    };
  }

  function futureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  const DOMAIN_META = {
    technical: { label: "技術", color: "#5b6cf9" },
    service: { label: "接客", color: "#13a474" },
    human: { label: "人間力", color: "#ed8a32" },
    autonomy: { label: "自走力", color: "#9b63d8" }
  };

  function cleanText(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback || "";
  }

  function normalizeVisionProfile(profile, workspace) {
    const source = profile && typeof profile === "object" ? clone(profile) : {};
    const onboarding = workspace?.onboarding || {};
    const statement = cleanText(
      source.statement || workspace?.vision,
      "なりたい美容師像を設定してください"
    );
    const priorities = asArray(source.priorityOrder)
      .filter(id => DOMAIN_META[id])
      .concat(["technical", "service", "human", "autonomy"])
      .filter((id, index, values) => values.indexOf(id) === index)
      .slice(0, 4);
    const values = asArray(source.values)
      .map(value => cleanText(value))
      .filter(Boolean)
      .slice(0, 5);
    return {
      version: 2,
      statement,
      targetCustomers: cleanText(source.targetCustomers),
      customerValue: cleanText(source.customerValue || onboarding.visionValue),
      technicalIdentity: cleanText(source.technicalIdentity),
      serviceIdentity: cleanText(source.serviceIdentity),
      humanIdentity: cleanText(source.humanIdentity),
      autonomyIdentity: cleanText(source.autonomyIdentity),
      avoidVision: cleanText(source.avoidVision || onboarding.avoidVision),
      values,
      priorityOrder: priorities,
      tradeoffs: asArray(source.tradeoffs).map(item => ({
        question: cleanText(item?.question),
        choice: cleanText(item?.choice),
        reason: cleanText(item?.reason)
      })).filter(item => item.question || item.choice || item.reason),
      arrivalDefinition: cleanText(source.arrivalDefinition || onboarding.arrivalDefinition),
      updatedAt: source.updatedAt || "",
      generatedAt: source.generatedAt || ""
    };
  }

  function domainFromFocus(focusArea) {
    const text = String(focusArea || "");
    if (/接客|カウンセリング|提案/.test(text)) return "service";
    if (/人間|報告|時間|責任/.test(text)) return "human";
    if (/自走|判断|言語|学習/.test(text)) return "autonomy";
    return "technical";
  }

  function routeDate(start, deadline, ratio) {
    if (ratio >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ""))) return deadline;
    const from = new Date(`${start}T12:00:00Z`);
    const to = new Date(`${deadline}T12:00:00Z`);
    const fromTime = Number.isNaN(from.getTime()) ? Date.now() : from.getTime();
    const toTime = Number.isNaN(to.getTime()) ? fromTime + 180 * 86400000 : to.getTime();
    return new Date(fromTime + Math.max(86400000, toTime - fromTime) * ratio)
      .toISOString()
      .slice(0, 10);
  }

  function routeTemplates(domain, focusLabel) {
    const technicalFocus = cleanText(focusLabel, "設計判断");
    const templates = {
      technical: [
        {
          title: "完成像を読む",
          type: "Foundation",
          criteria: "完成スタイルを長さ・シルエット・ウェイト・質感へ分解し、自分の言葉で説明できる。",
          evidence: "完成像分析3件 / Before・After比較 / 本人説明",
          issue: "完成像から、施術前に押さえるべき構造を何によって決めるか？"
        },
        {
          title: "技術生成工程を診断",
          type: "Diagnostic",
          criteria: "観察・解釈・設計・操作・確認・修正のどこで判断が止まったかを特定できる。",
          evidence: "異なるモデル2件 / 停止工程の自己診断 / Support比較",
          issue: "結果のズレは、技術生成工程のどこから始まっているか？"
        },
        {
          title: `${technicalFocus}を自立`,
          type: "Critical",
          criteria: `${technicalFocus}を完成像から逆算し、Supportの答えに依存せず設計・実行できる。`,
          evidence: "設計記録3件 / モデル2名 / 判断理由 / Support介入L1以下",
          issue: `${technicalFocus}を、条件が変わっても自分で決めるには何を基準にするか？`
        },
        {
          title: "異条件へ転用",
          type: "Transfer",
          criteria: "骨格・髪質・長さが変わっても、獲得した判断原則を修正して再利用できる。",
          evidence: "条件違い3件 / 再現率80%以上 / 失敗条件の説明",
          issue: "同じ判断原則を、異なる条件へどう調整すれば再現できるか？"
        }
      ],
      service: [
        {
          title: "顧客理解を構造化",
          type: "Foundation",
          criteria: "要望・背景・優先順位・NG条件を分けて確認し、合意した完成像を言語化できる。",
          evidence: "カウンセリング記録3件 / 要望整理 / 本人確認",
          issue: "お客様の言葉から、仕上がり判断に必要な情報をどう取り出すか？"
        },
        {
          title: "接客体験の停止点を診断",
          type: "Diagnostic",
          criteria: "第一印象・理解・提案・施術中・仕上げ・次回接続のどこで体験価値が弱まったかを特定できる。",
          evidence: "接客振り返り3件 / Support観察 / 顧客反応",
          issue: "目指す顧客体験は、接客工程のどこで途切れているか？"
        },
        {
          title: "提案と合意をつくる",
          type: "Critical",
          criteria: "要望と技術条件を、安心感のある選択肢と根拠へ変換し、顧客と合意できる。",
          evidence: "提案記録3件 / 合意確認 / 言い換え比較",
          issue: "要望と技術判断を、押しつけずに納得できる提案へどう変えるか？"
        },
        {
          title: "顧客条件へ適応",
          type: "Transfer",
          criteria: "会話量・知識量・不安の強さが異なる顧客にも、Visionと一貫した体験をつくれる。",
          evidence: "顧客条件違い3件 / 自己評価 / Support確認",
          issue: "相手が変わっても、黒坂らしい価値をどう保つか？"
        }
      ],
      human: [
        {
          title: "判断と報告の基準を持つ",
          type: "Foundation",
          criteria: "不確実な状態を隠さず、事実・仮説・必要な支援を適切な時点で共有できる。",
          evidence: "判断記録3件 / 報告タイミング / Support確認",
          issue: "分からない状態を、いつ・何を根拠に共有すべきか？"
        },
        {
          title: "行動停止点を診断",
          type: "Diagnostic",
          criteria: "先延ばし・抱え込み・確認依存が起きる条件と、その直前の判断を説明できる。",
          evidence: "停止事例2件 / 原因仮説 / 行動変更",
          issue: "判断が止まる直前に、何を見落としているか？"
        },
        {
          title: "不確実性を扱う",
          type: "Critical",
          criteria: "正解がない状況で仮説を立て、必要な相談を行い、結果へ責任を持って修正できる。",
          evidence: "仮説検証3件 / 相談判断 / 修正記録",
          issue: "正解が見えない状況で、どう仮説を立てて前へ進むか？"
        }
      ],
      autonomy: [
        {
          title: "価値ある問いを立てる",
          type: "Foundation",
          criteria: "感想や苦手ではなく、次の経験で答えを検証できる問いへ変換できる。",
          evidence: "問い3件 / 必要性の説明 / 検証条件",
          issue: "今の局面で、何に答えれば最も成長が動くか？"
        },
        {
          title: "仮説検証を自走",
          type: "Critical",
          criteria: "問い・成功条件・Practice・Evidence・振り返りを自分で一周させられる。",
          evidence: "自走サイクル3回 / Support介入L1以下 / 次の問い",
          issue: "Supportが答えを示さなくても、必要な解までどう到達するか？"
        }
      ]
    };
    return templates[domain] || templates.technical;
  }

  function createPersonalJourney(workspace, options) {
    const source = workspace && typeof workspace === "object" ? workspace : {};
    const profile = normalizeVisionProfile(source.visionProfile, source);
    const assessment = source.onboarding?.selfAssessment || {};
    const focusDomain = domainFromFocus(source.focusArea);
    const priorities = profile.priorityOrder.slice();
    const scores = {};
    Object.keys(DOMAIN_META).forEach((domain, index) => {
      scores[domain] =
        (focusDomain === domain ? 40 : 0) +
        (4 - priorities.indexOf(domain)) * 8 +
        (7 - Math.max(0, Number(assessment[domain]) || 0)) * 5 +
        (domain === "technical" || domain === "service" ? 8 : 0) -
        index * .01;
    });
    const orderedDomains = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const primary = orderedDomains[0] || focusDomain;
    const secondary = orderedDomains[1] || (primary === "technical" ? "service" : "technical");
    const checkpointSeeds = [
      ...routeTemplates(primary, source.focusArea).slice(0, 3),
      routeTemplates(secondary, source.focusArea)[0],
      {
        title: `${DOMAIN_META[secondary].label}との統合診断`,
        type: "Diagnostic",
        criteria: `${DOMAIN_META[primary].label}と${DOMAIN_META[secondary].label}が一つの顧客体験としてつながっているかを診断できる。`,
        evidence: "モデル2件 / 本人説明 / Support比較",
        issue: `${DOMAIN_META[primary].label}の判断は、${DOMAIN_META[secondary].label}の価値とどこでつながるか？`,
        domain: secondary
      },
      ...routeTemplates(primary, source.focusArea).slice(3, 4),
      {
        title: "自走サイクルを確認",
        type: "Optional",
        criteria: "問いからEvidence・Library化までを自分で一周し、次の問いを設定できる。",
        evidence: "自走サイクル2回 / Library資産1件",
        issue: "今回の経験を、次の判断へどう再利用するか？",
        domain: "autonomy"
      },
      {
        title: "スタイリスト実践を自力完結",
        type: "Integration",
        criteria: profile.arrivalDefinition || "接客から施術・説明・次回提案まで、Visionと一貫した判断で自力完結できる。",
        evidence: "条件違いモデル3件 / 顧客体験確認 / Support最終確認",
        issue: "Visionで定義した価値を、一連の顧客体験として再現できるか？",
        domain: primary
      }
    ];
    const deadline = source.deadline || futureDate(180);
    const today = options?.today || new Date().toISOString().slice(0, 10);
    const checkpoints = checkpointSeeds.map((seed, index) => {
      const domain = seed.domain || (
        index < 3 ? primary :
        index < 5 ? secondary :
        index === 6 ? "autonomy" : primary
      );
      const optional = seed.type === "Optional";
      const status = index === 0 ? "current" : index === 1 ? "next" : optional ? "optional" : "locked";
      const hours = seed.type === "Diagnostic" ? 10 :
        seed.type === "Integration" ? 28 :
        seed.type === "Transfer" ? 24 :
        optional ? 12 : 20;
      return {
        id: `journey-v2-${index + 1}`,
        code: `CP${index + 1}`,
        title: seed.title,
        description: seed.criteria,
        domain,
        type: seed.type,
        date: routeDate(today, deadline, (index + 1) / checkpointSeeds.length),
        status,
        order: index + 1,
        parentId: "",
        dependsOn: index && !optional ? [`journey-v2-${index}`] : [],
        depends: index && !optional ? `CP${index}` : "",
        criteria: seed.criteria,
        successConditions: [seed.criteria],
        evidenceRequirements: seed.evidence.split(" / "),
        evidence: seed.evidence,
        issue: seed.issue,
        hours,
        actual: 0,
        evidenceItems: [],
        history: [],
        supportHistory: [],
        confidence: 0,
        source: "generated"
      };
    });
    const required = checkpoints.filter(item => item.type !== "Optional");
    return {
      version: 2,
      routeMode: "personalized",
      generatedFrom: {
        visionVersion: profile.version,
        deadline,
        generatedAt: isoNow(),
        focusDomain: primary
      },
      domains: Object.keys(DOMAIN_META).map(domain => ({
        id: domain,
        label: DOMAIN_META[domain].label,
        color: DOMAIN_META[domain].color,
        weight: Math.max(1, Math.round(scores[domain])),
        target: cleanText(profile[`${domain}Identity`]),
        status: domain === primary ? "focus" : domain === secondary ? "connected" : "supporting"
      })),
      checkpoints,
      currentCheckpointId: checkpoints[0]?.id || "",
      history: [],
      routeChanges: [],
      routeReason: `${DOMAIN_META[primary].label}を現在の主軸に置き、${DOMAIN_META[secondary].label}を接続して、期限日に一連の顧客体験を自力完結する順序です。`,
      requiredHours: required.reduce((sum, item) => sum + item.hours, 0),
      actualHours: 0
    };
  }

  function isDefaultJourney(journey) {
    const checkpoints = asArray(journey?.checkpoints);
    if (!checkpoints.length) return true;
    return checkpoints.length === 5 &&
      checkpoints.every((checkpoint, index) =>
        checkpoint.id === `cp${index + 1}` &&
        asArray(checkpoint.evidenceItems).length === 0 &&
        Number(checkpoint.actual || 0) === 0
      );
  }

  function defaultCheckpoint(index, deadline) {
    const titles = ["観察", "完成像", "基準点設計", "操作への変換", "条件転移"];
    const types = ["Foundation", "Critical", "Critical", "Required", "Transfer"];
    const criteria = [
      "骨格・髪質・生え方を分けて観察し、自分の言葉で説明できる。",
      "完成像を画像・言葉・シルエットで説明できる。",
      "完成像から最短点・最長点・接続位置を決定し、理由を説明できる。",
      "基準点をセクション・引き出し・角度・切り口へ変換できる。",
      "異なる骨格・髪質・長さでも判断原則を再利用できる。"
    ];
    return {
      id: `cp${index + 1}`,
      code: `CP${index + 1}`,
      title: titles[index] || `Checkpoint ${index + 1}`,
      date: index === 4 ? deadline : futureDate(36 * (index + 1)),
      type: types[index] || "Required",
      status: index === 0 ? "current" : "locked",
      hours: [18, 24, 32, 36, 30][index] || 20,
      actual: 0,
      criteria: criteria[index] || "",
      evidence: "",
      issue: index === 0 ? "完成像へ近づくため、何を観察できる必要があるか？" : "",
      depends: index ? `CP${index}` : "",
      evidenceItems: [],
      history: [],
      supportHistory: []
    };
  }

  function normalizeCheckpoint(checkpoint, index, deadline) {
    const base = defaultCheckpoint(index, deadline);
    const result = Object.assign(base, clone(checkpoint || {}));
    result.id = result.id || `cp${index + 1}`;
    result.code = result.code || `CP${index + 1}`;
    result.evidenceItems = asArray(result.evidenceItems);
    result.history = asArray(result.history);
    result.supportHistory = asArray(result.supportHistory);
    result.dependsOn = asArray(result.dependsOn);
    result.successConditions = asArray(result.successConditions);
    result.evidenceRequirements = asArray(result.evidenceRequirements);
    result.order = Number(result.order) || index + 1;
    result.domain = result.domain || "technical";
    result.description = result.description || result.criteria || "";
    result.confidence = Math.max(0, Math.min(100, Number(result.confidence) || 0));
    result.source = result.source || "legacy";
    return result;
  }

  function createWorkspace(staffId, seed, options) {
    const source = seed && typeof seed === "object" ? clone(seed) : {};
    const blank = Boolean(options?.blank);
    const legacyConfigured = !blank;
    const deadline = source.deadline || futureDate(180);
    const sourceJourney = source.journey && typeof source.journey === "object"
      ? source.journey
      : {};
    const sourceCheckpoints = asArray(sourceJourney.checkpoints);
    const checkpoints = (sourceCheckpoints.length && !blank
      ? sourceCheckpoints
      : Array.from({ length: 5 }, (_, index) => defaultCheckpoint(index, deadline))
    ).map((checkpoint, index) => normalizeCheckpoint(checkpoint, index, deadline));
    if (!checkpoints.some(item => item.status === "current") && checkpoints.length) {
      const next = checkpoints.find(item => item.status !== "done") || checkpoints[0];
      next.status = "current";
    }

    const workspaceSeed = {
      vision: blank ? "なりたい美容師像を設定してください" : (
        typeof source.vision === "object" ? source.vision.text : source.vision
      ) || "なりたい美容師像を設定してください",
      onboarding: clone(source.onboarding || {})
    };
    const visionProfile = normalizeVisionProfile(source.visionProfile, workspaceSeed);
    const workspace = {
      staffId,
      vision: visionProfile.statement,
      visionProfile,
      deadline,
      hours: Math.max(0, Number(source.hours ?? source.weeklyHours ?? 6) || 0),
      overtimeHours: Math.max(0, Number(source.overtimeHours || 0) || 0),
      focusArea: source.focusArea || source.currentFocus || "技術",
      progress: blank ? 0 : Math.max(0, Math.min(100, Number(source.progress) || 0)),
      planned: blank ? 0 : Math.max(0, Math.min(100, Number(source.planned) || 0)),
      issue: Object.assign({
        title: "次のCheckpointへ進むため、今もっとも答える必要がある問いを設定する",
        age: 0,
        successConditions: []
      }, blank ? {} : clone(source.issue || {})),
      journey: Object.assign({
        version: Number(sourceJourney.version) || 1,
        routeMode: sourceJourney.routeMode || "legacy",
        generatedFrom: clone(sourceJourney.generatedFrom || {}),
        domains: asArray(sourceJourney.domains),
        currentCheckpointId: sourceJourney.currentCheckpointId || "",
        routeChanges: asArray(sourceJourney.routeChanges),
        routeReason: sourceJourney.routeReason || ""
      }, sourceJourney, {
        checkpoints,
        history: blank ? [] : asArray(sourceJourney.history),
        domains: asArray(sourceJourney.domains),
        routeChanges: asArray(sourceJourney.routeChanges),
        currentCheckpointId: sourceJourney.currentCheckpointId ||
          checkpoints.find(item => item.status === "current")?.id ||
          checkpoints[0]?.id ||
          "",
        requiredHours: checkpoints.reduce((sum, item) => sum + (Number(item.hours) || 0), 0),
        actualHours: checkpoints.reduce((sum, item) => sum + (Number(item.actual) || 0), 0)
      }),
      modelBookings: blank ? [] : asArray(source.modelBookings || source.modelPlans || source.models),
      practiceSessions: blank ? [] : asArray(source.practiceSessions || source.records),
      supportSessions: blank ? [] : asArray(source.supportSessions),
      practiceDraft: blank ? null : (
        source.practiceDraft && typeof source.practiceDraft === "object"
          ? source.practiceDraft
          : null
      ),
      libraryUi: source.libraryUi && typeof source.libraryUi === "object"
        ? source.libraryUi
        : { query: "", filter: "all", view: "grid" },
      libraryRefs: blank ? [] : asArray(source.libraryRefs),
      primarySupportId: source.primarySupportId || "",
      supportMemberIds: asArray(source.supportMemberIds),
      onboarding: Object.assign({
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
          vision: legacyConfigured,
          arrival: legacyConfigured,
          time: legacyConfigured,
          current: legacyConfigured,
          issue: legacyConfigured,
          support: legacyConfigured
        },
        completedAt: "",
        updatedAt: ""
      }, clone(source.onboarding || {}), {
        selfAssessment: Object.assign({
          technical: 0,
          service: 0,
          human: 0,
          autonomy: 0
        }, clone(source.onboarding?.selfAssessment || {})),
        confirmed: Object.assign({
          vision: legacyConfigured,
          arrival: legacyConfigured,
          time: legacyConfigured,
          current: legacyConfigured,
          issue: legacyConfigured,
          support: legacyConfigured
        }, clone(source.onboarding?.confirmed || {}))
      }),
      meta: Object.assign({
        schemaVersion: SCHEMA_VERSION,
        visionVersion: Number(source.meta?.visionVersion) || Number(source.visionProfile?.version) || 1,
        onboardingComplete: blank ? false : Boolean(source.meta?.onboardingComplete),
        migratedFrom: "",
        lastSaved: "",
        createdAt: isoNow(),
        updatedAt: isoNow()
      }, clone(source.meta || {}), { schemaVersion: SCHEMA_VERSION })
    };
    return workspace;
  }

  function workspaceFromState(state, staffId, existing) {
    const next = Object.assign({}, clone(existing || {}));
    for (const key of WORKSPACE_KEYS) {
      if (key in (state || {})) next[key] = clone(state[key]);
    }
    next.staffId = staffId;
    next.meta = Object.assign({}, next.meta || {}, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: isoNow()
    });
    return createWorkspace(staffId, next);
  }

  function stateFromWorkspace(workspace, sharedLibrary, role, page) {
    const result = clone(workspace);
    result.role = role || "staff";
    result.page = page || (result.role === "staff" ? "home" : result.role);
    result.library = clone(asArray(sharedLibrary));
    return result;
  }

  function normalizeAssetImage(image, index, asset) {
    const source = image && typeof image === "object"
      ? clone(image)
      : { src: typeof image === "string" ? image : "" };
    return Object.assign({
      id: uid("asset-image", `${asset?.id || "asset"}-${index + 1}`),
      src: "",
      role: index === 0 ? "before" : index === 1 ? "after" : "detail",
      label: index === 0 ? "Before" : index === 1 ? "After" : `Image ${index + 1}`,
      capturedAt: "",
      note: "",
      fileName: "",
      addedBy: asset?.updatedBy || "System",
      addedById: asset?.updatedById || "",
      createdAt: asset?.updatedAt || ""
    }, source);
  }

  function normalizeAsset(asset, index) {
    const source = clone(asset || {});
    let images = asArray(source.images)
      .map((image, imageIndex) => normalizeAssetImage(image, imageIndex, source))
      .filter(image => image.src);
    if (!images.length && source.image) {
      images = [normalizeAssetImage({
        src: source.image,
        role: "legacy",
        label: "既存画像"
      }, 0, source)];
    }
    const comparison = Object.assign({
      mode: images.length >= 2 ? "before-after" : "free",
      title: "",
      note: ""
    }, source.comparison || {});
    return Object.assign({
      id: `asset-${index + 1}`,
      title: "Untitled",
      tag: "",
      case: "",
      decision: "",
      correction: "",
      rule: "",
      next: "",
      image: "",
      images: [],
      comparison,
      modelId: "",
      modelName: "",
      updatedBy: "System",
      updatedAt: "",
      updatedById: "",
      staffIds: [],
      history: []
    }, source, {
      image: source.image || images[0]?.src || "",
      images,
      comparison,
      staffIds: asArray(source.staffIds),
      history: asArray(source.history)
    });
  }

  function migrateLegacy(legacyState, options) {
    const legacy = legacyState && typeof legacyState === "object"
      ? (legacyState.state || legacyState.data || legacyState)
      : {};
    const createdAt = isoNow();
    const staff = createMember("staff", {
      id: options?.staffId || "staff-legacy-1",
      name: options?.staffName || legacy.staffName || legacy.profile?.name || "黒坂",
      createdAt
    });
    const support = createMember("support", {
      id: options?.supportId || "support-legacy-1",
      name: options?.supportName || "小畑",
      createdAt
    });
    const management = createMember("management", {
      id: options?.managementId || "management-legacy-1",
      name: options?.managementName || "小畑",
      createdAt
    });
    staff.primarySupportId = support.id;
    staff.supportMemberIds = [support.id];
    support.staffIds = [staff.id];
    management.staffIds = [staff.id];

    const workspace = createWorkspace(staff.id, legacy);
    workspace.primarySupportId = support.id;
    workspace.supportMemberIds = [support.id];
    workspace.libraryRefs = asArray(legacy.library).map(asset => asset.id).filter(Boolean);
    workspace.meta.migratedFrom = options?.sourceKey || legacyState?.storageKey || "legacy-single-state";

    const library = asArray(legacy.library).map((asset, index) => {
      const normalized = normalizeAsset(asset, index);
      normalized.staffIds = Array.from(new Set([...normalized.staffIds, staff.id]));
      return normalized;
    });

    return {
      format: "growth-os-organization",
      schemaVersion: SCHEMA_VERSION,
      organization: {
        id: options?.organizationId || "organization-growth-os",
        name: options?.organizationName || "Growth OS",
        staffMembers: [staff],
        supportMembers: [support],
        managementMembers: [management],
        activeStaffId: staff.id,
        activeSupportId: support.id,
        activeManagementId: management.id,
        library,
        auditLog: [{
          id: uid("audit", createdAt),
          at: createdAt,
          actorId: "system",
          actorName: "System",
          actorRole: "system",
          targetStaffId: staff.id,
          action: "旧データを複数人物構造へ移行",
          detail: workspace.meta.migratedFrom
        }],
        ui: { role: legacy.role || "staff", pages: {} },
        createdAt,
        updatedAt: createdAt
      },
      staffWorkspaces: { [staff.id]: workspace }
    };
  }

  function normalizeMemberList(list, role) {
    return asArray(list).map(member => createMember(role, member));
  }

  function normalizeOrganizationPayload(payload, fallbackState) {
    if (!payload || typeof payload !== "object" || !payload.organization) {
      return migrateLegacy(payload || fallbackState || {}, { sourceKey: "legacy-import" });
    }
    const source = clone(payload);
    const organization = source.organization || {};
    const staffMembers = normalizeMemberList(organization.staffMembers, "staff");
    const supportMembers = normalizeMemberList(organization.supportMembers, "support");
    const managementMembers = normalizeMemberList(organization.managementMembers, "management");
    if (!staffMembers.length) {
      return migrateLegacy(fallbackState || {}, { sourceKey: "empty-organization" });
    }
    if (!supportMembers.length) supportMembers.push(createMember("support", { name: "Support" }));
    if (!managementMembers.length) managementMembers.push(createMember("management", { name: "Management" }));

    const staffWorkspaces = {};
    for (const staff of staffMembers) {
      const sourceWorkspace = source.staffWorkspaces?.[staff.id] || {};
      const workspace = createWorkspace(staff.id, sourceWorkspace, {
        blank: !source.staffWorkspaces?.[staff.id]
      });
      workspace.primarySupportId = staff.primarySupportId || workspace.primarySupportId || "";
      workspace.supportMemberIds = asArray(staff.supportMemberIds).length
        ? asArray(staff.supportMemberIds)
        : asArray(workspace.supportMemberIds);
      staff.primarySupportId = workspace.primarySupportId;
      staff.supportMemberIds = workspace.supportMemberIds.slice();
      staffWorkspaces[staff.id] = workspace;
    }
    const activeStaffId = staffMembers.some(item => item.id === organization.activeStaffId && item.status === "active")
      ? organization.activeStaffId
      : (staffMembers.find(item => item.status === "active") || staffMembers[0]).id;
    const activeSupportId = supportMembers.some(item => item.id === organization.activeSupportId && item.status === "active")
      ? organization.activeSupportId
      : (supportMembers.find(item => item.status === "active") || supportMembers[0]).id;
    const activeManagementId = managementMembers.some(item => item.id === organization.activeManagementId && item.status === "active")
      ? organization.activeManagementId
      : (managementMembers.find(item => item.status === "active") || managementMembers[0]).id;

    return {
      format: "growth-os-organization",
      schemaVersion: SCHEMA_VERSION,
      organization: Object.assign({}, organization, {
        id: organization.id || "organization-growth-os",
        name: organization.name || "Growth OS",
        staffMembers,
        supportMembers,
        managementMembers,
        activeStaffId,
        activeSupportId,
        activeManagementId,
        library: asArray(organization.library || source.library).map(normalizeAsset),
        auditLog: asArray(organization.auditLog),
        ui: Object.assign({ role: "staff", pages: {} }, organization.ui || {}),
        createdAt: organization.createdAt || isoNow(),
        updatedAt: isoNow()
      }),
      staffWorkspaces
    };
  }

  function exportPayload(payload) {
    const normalized = normalizeOrganizationPayload(payload);
    normalized.exportedAt = isoNow();
    return normalized;
  }

  return {
    SCHEMA_VERSION,
    WORKSPACE_KEYS,
    clone,
    asArray,
    uid,
    isoNow,
    createMember,
    normalizeVisionProfile,
    createPersonalJourney,
    isDefaultJourney,
    DOMAIN_META,
    createWorkspace,
    workspaceFromState,
    stateFromWorkspace,
    normalizeAsset,
    normalizeAssetImage,
    migrateLegacy,
    normalizeOrganizationPayload,
    exportPayload
  };
});
