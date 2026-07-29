;(function attachGrowthTeamCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GrowthTeamCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGrowthTeamCore() {
  "use strict";

  const SCHEMA_VERSION = 10;
  const WORKSPACE_KEYS = [
    "visionProfile", "deadline", "hours", "overtimeHours", "focusArea",
    "currentQuestion", "journey", "modelBookings",
    "practiceSessions", "supportSessions", "practiceDraft", "libraryUi",
    "libraryRefs", "evidenceRecords", "journeyUpdates", "supportRequests",
    "onboarding", "meta"
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

  const JUDGMENT_STAGE_META = {
    observation: { label: "観察", order: 1 },
    interpretation: { label: "解釈", order: 2 },
    design: { label: "設計", order: 3 },
    execution: { label: "実行", order: 4 },
    verification: { label: "確認", order: 5 },
    correction: { label: "修正", order: 6 },
    transfer: { label: "転用", order: 7 }
  };

  const CAPABILITY_CATALOG = {
    technical: {
      observation: "骨格・髪質・生え方を捉える",
      interpretation: "完成像を構造へ読み替える",
      design: "基準点と接続を決める",
      execution: "設計を操作へ変換する",
      verification: "完成像との差を発見する",
      correction: "原因から修正方法を選ぶ",
      transfer: "異条件へ判断原則を転用する"
    },
    service: {
      observation: "言葉・表情・反応を捉える",
      interpretation: "要望の背景と優先順位を読む",
      design: "提案と合意の流れを組み立てる",
      execution: "安心できる顧客体験を実行する",
      verification: "理解と納得を確認する",
      correction: "反応に合わせて接客を修正する",
      transfer: "顧客条件が変わっても価値を保つ"
    },
    human: {
      observation: "自分と周囲の状態を事実で捉える",
      interpretation: "感情と事実を分けて意味づける",
      design: "報告・相談・協働の順序を決める",
      execution: "必要な行動を約束どおり実行する",
      verification: "相手への影響と責任を確認する",
      correction: "フィードバックから行動を直す",
      transfer: "状況が変わっても姿勢を保つ"
    },
    autonomy: {
      observation: "経験から違和感を発見する",
      interpretation: "あらの奥にある成長の鍵を読む",
      design: "価値ある問いと成功条件をつくる",
      execution: "仮説検証を自分で一周させる",
      verification: "Evidenceから判断を更新する",
      correction: "問い・方法・現在地を修正する",
      transfer: "学びをLibraryと次の問いへ転用する"
    }
  };

  function inferJudgmentStage(value) {
    const source = value && typeof value === "object" ? value : {};
    if (JUDGMENT_STAGE_META[source.judgmentStage]) return source.judgmentStage;
    const text = [
      source.title, source.description, source.criteria, source.issue, source.type
    ].filter(Boolean).join(" ");
    if (/転用|転移|条件違い|異条件|再利用|応用|統合|Transfer|Integration/i.test(text)) return "transfer";
    if (/修正|補正|直す|Correction/i.test(text)) return "correction";
    if (/確認|比較|検証|診断|差を発見|Verification|Diagnostic/i.test(text)) return "verification";
    if (/操作|実行|施工|施術|Execution|Required/i.test(text)) return "execution";
    if (/設計|基準点|接続|提案|合意|Design|Critical/i.test(text)) return "design";
    if (/解釈|完成像|読み|意味|理解|Interpretation/i.test(text)) return "interpretation";
    return "observation";
  }

  function cleanText(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback || "";
  }

  function currentCheckpointOf(journey) {
    const checkpoints = asArray(journey?.checkpoints);
    return checkpoints.find(item => item.id === journey?.currentCheckpointId) ||
      checkpoints.find(item => item.status === "current") ||
      checkpoints.find(item => item.status !== "done") ||
      checkpoints[0] ||
      null;
  }

  function normalizeCurrentQuestion(question, workspace, checkpoints) {
    const source = question && typeof question === "object" ? clone(question) : {};
    const legacy = workspace?.issue && typeof workspace.issue === "object"
      ? workspace.issue
      : {};
    const checkpoint = currentCheckpointOf({
      checkpoints,
      currentCheckpointId: workspace?.journey?.currentCheckpointId
    });
    const text = cleanText(
      source.text || source.title || legacy.title || checkpoint?.issue,
      "次のCheckpointへ進むため、今もっとも答える必要がある問いを設定する"
    );
    return {
      id: source.id || uid("question", `${workspace?.staffId || "staff"}-${text}`),
      text,
      checkpointId: source.checkpointId || checkpoint?.id || "",
      whyNow: cleanText(source.whyNow || legacy.whyNow),
      evidenceIds: asArray(source.evidenceIds || legacy.evidenceIds),
      successConditions: asArray(
        source.successConditions ||
        legacy.successConditions ||
        checkpoint?.successConditions
      ).filter(Boolean),
      nextTest: cleanText(source.nextTest || legacy.nextCondition),
      status: ["active", "answered", "archived"].includes(source.status)
        ? source.status
        : "active",
      previousText: cleanText(source.previousText || legacy.previousTitle),
      history: asArray(source.history || legacy.history),
      updatedAt: source.updatedAt || legacy.updatedAt || "",
      updatedBy: cleanText(source.updatedBy || legacy.updatedBy)
    };
  }

  function normalizeEvidenceRecord(record, index, context) {
    const source = record && typeof record === "object" ? clone(record) : {};
    const title = cleanText(source.title, `Evidence ${index + 1}`);
    return {
      id: source.id || uid("evidence", `${context?.checkpointId || "cp"}-${index + 1}-${title}`),
      staffId: source.staffId || context?.staffId || "",
      checkpointId: source.checkpointId || context?.checkpointId || "",
      modelId: source.modelId || "",
      practiceId: source.practiceId || source.sourcePracticeId || "",
      sourceType: source.sourceType || (source.practiceId || source.sourcePracticeId ? "practice" : "legacy"),
      domain: DOMAIN_META[source.domain] ? source.domain : "",
      judgmentStage: JUDGMENT_STAGE_META[source.judgmentStage]
        ? source.judgmentStage
        : "",
      title,
      fact: cleanText(source.fact || source.result || source.note),
      judgment: cleanText(source.judgment || source.win || source.decision),
      whySo: asArray(source.whySo).map(cleanText).filter(Boolean),
      soWhat: cleanText(source.soWhat || source.next),
      nextTest: cleanText(source.nextTest || source.next),
      journeyImpact: Object.assign({
        status: "pending",
        checkpointStatus: "",
        confidenceDelta: 0,
        note: ""
      }, source.journeyImpact || {}),
      libraryAssetIds: asArray(source.libraryAssetIds),
      createdBy: cleanText(source.createdBy || source.by || context?.actorName),
      createdById: source.createdById || source.actorId || "",
      createdAt: source.createdAt || source.at || isoNow(),
      updatedAt: source.updatedAt || source.createdAt || source.at || isoNow()
    };
  }

  function normalizeJourneyUpdate(update, index) {
    const source = update && typeof update === "object" ? clone(update) : {};
    return {
      id: source.id || uid("journey-update", `${source.evidenceId || index}-${source.createdAt || index}`),
      evidenceId: source.evidenceId || "",
      checkpointId: source.checkpointId || "",
      status: ["pending", "applied", "rejected"].includes(source.status)
        ? source.status
        : "pending",
      impact: source.impact || "review",
      proposedQuestion: cleanText(source.proposedQuestion),
      note: cleanText(source.note),
      createdAt: source.createdAt || isoNow(),
      createdBy: cleanText(source.createdBy),
      resolvedAt: source.resolvedAt || "",
      resolvedBy: cleanText(source.resolvedBy)
    };
  }

  function normalizeSupportRequest(request, index, context) {
    const source = request && typeof request === "object" ? clone(request) : {};
    const allowedStatuses = ["pending", "acknowledged", "resolved", "cancelled"];
    return Object.assign({
      id: source.id || uid("support-request", `${context?.staffId || "staff"}-${index + 1}`),
      version: 1,
      staffId: source.staffId || context?.staffId || "",
      supportId: source.supportId || context?.supportId || "",
      checkpointId: source.checkpointId || context?.checkpointId || "",
      checkpointCode: source.checkpointCode || "",
      checkpointTitle: source.checkpointTitle || "",
      domain: source.domain || "",
      judgmentStage: JUDGMENT_STAGE_META[source.judgmentStage]
        ? source.judgmentStage
        : inferJudgmentStage(source),
      questionText: cleanText(source.questionText || source.question || source.issue),
      visionSnapshot: cleanText(source.visionSnapshot || source.vision),
      evidenceIds: asArray(source.evidenceIds),
      sourcePage: source.sourcePage || "home",
      whySo: cleanText(source.whySo),
      soWhat: cleanText(source.soWhat),
      status: allowedStatuses.includes(source.status) ? source.status : "pending",
      requestedAt: source.requestedAt || source.createdAt || isoNow(),
      requestedBy: source.requestedBy || source.createdBy || "Staff",
      acknowledgedAt: source.acknowledgedAt || "",
      acknowledgedBy: source.acknowledgedBy || "",
      resolvedAt: source.resolvedAt || "",
      resolvedBy: source.resolvedBy || "",
      resolutionId: source.resolutionId || ""
    }, source, {
      evidenceIds: asArray(source.evidenceIds),
      status: allowedStatuses.includes(source.status) ? source.status : "pending"
    });
  }

  function normalizeModelBooking(model, index) {
    const source = model && typeof model === "object" ? clone(model) : {};
    return Object.assign({
      id: uid("model", `${source.date || "date"}-${index + 1}`),
      name: "",
      date: "",
      time: "",
      duration: 120,
      menu: "カット",
      checkpointId: "",
      checkpointCode: "",
      validationQuestion: "",
      note: "",
      updatedAt: ""
    }, source, {
      validationQuestion: cleanText(source.validationQuestion || source.theme || source.memo || source.note),
      note: cleanText(source.note || source.validationQuestion || source.theme || source.memo)
    });
  }

  function deriveJourneyMetrics(workspace) {
    const checkpoints = asArray(workspace?.journey?.checkpoints);
    const required = checkpoints
      .filter(item => item.type !== "Optional")
      .reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
    const actual = checkpoints.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
    const progress = required ? Math.min(100, Math.round(actual / required * 100)) : 0;
    const start = new Date(`${workspace?.journey?.generatedFrom?.generatedAt || ""}`);
    const deadline = new Date(`${workspace?.deadline || ""}T23:59:59`);
    const now = new Date();
    const duration = deadline.getTime() - start.getTime();
    const planned = duration > 0 && !Number.isNaN(duration)
      ? Math.max(0, Math.min(100, Math.round((now.getTime() - start.getTime()) / duration * 100)))
      : progress;
    return { required, actual, progress, planned };
  }

  function capabilityStatus(score, sourceCount) {
    if (!sourceCount) return "unconnected";
    if (score >= 80) return "stable";
    if (score >= 45) return "growing";
    return "emerging";
  }

  function requirementList(checkpoint) {
    const explicit = asArray(checkpoint?.evidenceRequirements).filter(Boolean);
    if (explicit.length) return explicit;
    return String(checkpoint?.evidence || "")
      .split("/")
      .map(item => item.trim())
      .filter(Boolean);
  }

  function checkpointCapabilityMetric(checkpoint, workspace) {
    const records = asArray(workspace?.evidenceRecords)
      .filter(record => record.checkpointId === checkpoint.id);
    const requirements = requirementList(checkpoint);
    const applied = records.filter(record => record.journeyImpact?.status === "applied").length;
    const pending = records.filter(record => record.journeyImpact?.status !== "applied" &&
      record.journeyImpact?.status !== "rejected").length;
    const evidenceTarget = Math.max(1, requirements.length);
    const evidenceScore = Math.min(100, Math.round(
      (applied + pending * .35) / evidenceTarget * 100
    ));
    const hoursScore = Number(checkpoint.hours)
      ? Math.min(100, Math.round((Number(checkpoint.actual) || 0) / Number(checkpoint.hours) * 100))
      : 0;
    const confidenceScore = Math.max(0, Math.min(100, Number(checkpoint.confidence) || 0));
    const score = checkpoint.status === "done"
      ? 100
      : Math.round(evidenceScore * .5 + hoursScore * .3 + confidenceScore * .2);
    const stage = inferJudgmentStage(checkpoint);
    return {
      id: checkpoint.id,
      code: checkpoint.code || "",
      title: checkpoint.title || "Checkpoint",
      domain: DOMAIN_META[checkpoint.domain] ? checkpoint.domain : "technical",
      judgmentStage: stage,
      score,
      status: capabilityStatus(score, records.length + Number(checkpoint.actual > 0)),
      evidenceCount: records.length,
      appliedEvidenceCount: applied,
      pendingEvidenceCount: pending,
      requiredEvidenceCount: requirements.length,
      actualHours: Number(checkpoint.actual) || 0,
      requiredHours: Number(checkpoint.hours) || 0,
      confidence: confidenceScore,
      criteria: checkpoint.criteria || checkpoint.description || "",
      whySo: `${applied}件の反映済みEvidence、${pending}件の審査中Evidence、${Number(checkpoint.actual) || 0}/${Number(checkpoint.hours) || 0}時間`,
      soWhat: checkpoint.status === "done"
        ? "別条件で再現し、転用できるかを確認する"
        : checkpoint.issue || "次のPracticeで成功条件を検証する"
    };
  }

  function dataConnectionMetric(id, label, checks, detail) {
    const validChecks = asArray(checks);
    const passed = validChecks.filter(Boolean).length;
    const score = validChecks.length ? Math.round(passed / validChecks.length * 100) : 0;
    return {
      id,
      label,
      score,
      status: capabilityStatus(score, passed),
      sourceCount: passed,
      whySo: detail?.whySo || `${passed}/${validChecks.length}の接続条件を満たしています`,
      soWhat: detail?.soWhat || (score < 100 ? "未接続の条件を次の実践で埋める" : "接続を次の判断へ再利用する"),
      page: detail?.page || ""
    };
  }

  function deriveCapabilityMap(workspace) {
    const source = workspace && typeof workspace === "object" ? workspace : {};
    const checkpoints = asArray(source.journey?.checkpoints);
    const checkpointMetrics = checkpoints.map(checkpoint =>
      checkpointCapabilityMetric(checkpoint, source)
    );
    const assessments = source.onboarding?.selfAssessment || {};
    const domains = Object.keys(DOMAIN_META).map(domain => {
      const related = checkpointMetrics.filter(item => item.domain === domain);
      const weightTotal = related.reduce((sum, item) => sum + Math.max(1, item.requiredHours), 0);
      const score = weightTotal
        ? Math.round(related.reduce((sum, item) =>
          sum + item.score * Math.max(1, item.requiredHours), 0
        ) / weightTotal)
        : 0;
      const evidenceCount = related.reduce((sum, item) => sum + item.evidenceCount, 0);
      const appliedEvidenceCount = related.reduce((sum, item) =>
        sum + item.appliedEvidenceCount, 0
      );
      const selfScore = Math.round(Math.max(0, Math.min(7, Number(assessments[domain]) || 0)) / 7 * 100);
      return {
        id: domain,
        label: DOMAIN_META[domain].label,
        color: DOMAIN_META[domain].color,
        score,
        selfScore,
        status: capabilityStatus(score, related.length),
        checkpointCount: related.length,
        evidenceCount,
        appliedEvidenceCount,
        sourceCount: related.length + evidenceCount,
        checkpoints: related,
        whySo: related.length
          ? `${related.length}個のCheckpointと${evidenceCount}件のEvidenceから算出`
          : "この能力領域へ接続されたCheckpointがありません",
        soWhat: related.length
          ? (score >= 80 ? "異なる条件でも再現・転用できるかを確認する" : "最も浅い判断工程を次の問いへ接続する")
          : "Visionとの関係を確認し、必要ならCheckpointを設計する"
      };
    });

    const stages = Object.keys(JUDGMENT_STAGE_META).map(stage => {
      const related = checkpointMetrics.filter(item => item.judgmentStage === stage);
      const score = related.length
        ? Math.round(related.reduce((sum, item) => sum + item.score, 0) / related.length)
        : 0;
      return {
        id: stage,
        label: JUDGMENT_STAGE_META[stage].label,
        order: JUDGMENT_STAGE_META[stage].order,
        score,
        status: capabilityStatus(score, related.length),
        sourceCount: related.length,
        checkpoints: related,
        whySo: related.length
          ? `${related.length}個のCheckpointがこの判断工程へ接続`
          : "この判断工程へ接続されたCheckpointがありません",
        soWhat: related.length
          ? "関連Evidenceを比較し、判断が止まる条件を確認する"
          : "次のCheckpoint設計時に、この工程が必要か確認する"
      };
    });

    const profile = source.visionProfile || {};
    const currentQuestion = source.currentQuestion || {};
    const practices = asArray(source.practiceSessions);
    const support = asArray(source.supportSessions);
    const supportRequests = asArray(source.supportRequests);
    const models = asArray(source.modelBookings);
    const evidence = asArray(source.evidenceRecords);
    const library = asArray(source.library);
    const futureModels = models.filter(model => !model.date ||
      model.date >= new Date().toISOString().slice(0, 10));
    const connectedLibrary = library.filter(asset =>
      asset.checkpointId || asset.journeyConnection?.status === "connected"
    );
    const reusableLibrary = library.filter(asset =>
      asset.rule && asArray(asset.evidenceIds).length
    );
    const systems = [
      dataConnectionMetric("vision", "Vision Profile", [
        profile.statement && !String(profile.statement).includes("設定してください"),
        profile.targetCustomers,
        profile.customerValue,
        profile.technicalIdentity,
        profile.serviceIdentity,
        profile.humanIdentity,
        profile.autonomyIdentity,
        profile.arrivalDefinition
      ], {
        page: "vision",
        whySo: "完成像・顧客価値・4能力領域・期限時点の到達像を確認",
        soWhat: "不足項目がJourneyの設計漏れを生んでいないか確認する"
      }),
      dataConnectionMetric("journey", "Journey / Checkpoint", [
        checkpoints.length,
        source.journey?.currentCheckpointId,
        checkpoints.every(item => item.criteria || item.description),
        checkpoints.every(item => item.domain),
        checkpoints.every(item => item.judgmentStage || inferJudgmentStage(item)),
        checkpoints.some(item => item.status === "current")
      ], {
        page: "journey",
        whySo: `${checkpoints.length}個のCheckpoint、Current ${source.journey?.currentCheckpointId ? "設定済み" : "未設定"}`,
        soWhat: "未接続領域と判断工程をJourneyへ反映する"
      }),
      dataConnectionMetric("practice", "Practice", practices.length ? [
        practices.every(item => item.checkpointId),
        practices.every(item => item.question),
        practices.every(item => item.result),
        practices.every(item => item.next)
      ] : [], {
        page: "practice",
        whySo: `${practices.length}件のPracticeを問い・結果・次の検証で監査`,
        soWhat: practices.length ? "Evidence審査とJourney反映を確認する" : "Current Checkpointに接続したPracticeを実行する"
      }),
      dataConnectionMetric("support", "Support", (support.length || supportRequests.length) ? [
        supportRequests.length > 0,
        supportRequests.every(item => item.checkpointId && item.questionText && item.visionSnapshot),
        support.length > 0,
        support.length > 0 &&
          support.every(item => item.checkpointId && item.compare && item.diagnosis && item.next),
        supportRequests.every(item => item.status !== "resolved" || item.resolutionId)
      ] : [], {
        page: "support",
        whySo: `${supportRequests.length}件の依頼と${support.length}件のSupport判断を、文脈・診断・再検証で監査`,
        soWhat: support.length
          ? "判断修正が次のPracticeへ反映されたか確認する"
          : (supportRequests.length ? "依頼の文脈を基に比較質問と再検証条件を作る" : "答えではなく比較質問をSupportへ依頼する")
      }),
      dataConnectionMetric("planner", "Model Planner", futureModels.length ? [
        futureModels.every(item => item.date),
        futureModels.every(item => item.checkpointId),
        futureModels.every(item => item.validationQuestion),
        futureModels.every(item => item.menu)
      ] : [], {
        page: "planner",
        whySo: `${futureModels.length}件の今後のモデル予定をCheckpoint・問いとの接続で監査`,
        soWhat: futureModels.length ? "最も近いモデルをCurrent Checkpointの検証へ使う" : "次の問いを検証できるモデル条件を先に確保する"
      }),
      dataConnectionMetric("evidence", "Evidence", evidence.length ? [
        evidence.every(item => item.checkpointId),
        evidence.every(item => item.fact),
        evidence.every(item => item.judgment),
        evidence.every(item => asArray(item.whySo).length),
        evidence.every(item => item.soWhat || item.nextTest),
        evidence.some(item => item.journeyImpact?.status === "applied")
      ] : [], {
        page: "evidence",
        whySo: `${evidence.length}件中${evidence.filter(item => item.journeyImpact?.status === "applied").length}件がJourney反映済み`,
        soWhat: evidence.length ? "未反映Evidenceを審査し、現在地を更新する" : "Practiceを事実・判断・Why So?・So What?へ変換する"
      }),
      dataConnectionMetric("question", "今回の問い", [
        currentQuestion.text,
        currentQuestion.whyNow,
        asArray(currentQuestion.successConditions).length,
        currentQuestion.nextTest,
        currentQuestion.checkpointId,
        asArray(currentQuestion.evidenceIds).length
      ], {
        page: "issue",
        whySo: "問い・Why Now・成功条件・次の検証・Checkpoint・Evidenceの6接続を確認",
        soWhat: "不足する接続を補い、次のモデルで答えられる問いへ絞る"
      }),
      dataConnectionMetric("library", "Library", library.length ? [
        connectedLibrary.length === library.length,
        reusableLibrary.length > 0,
        library.every(asset => asset.next),
        library.every(asset => asset.decision || asset.rule)
      ] : [], {
        page: "library",
        whySo: `${connectedLibrary.length}/${library.length}件がJourney接続、${reusableLibrary.length}件がEvidence付き原則`,
        soWhat: library.length ? "未接続資産をCheckpointまたは次のPracticeへ戻す" : "検証済みEvidenceを再利用可能な原則へ変える"
      })
    ];

    const domainSourceCount = domains.reduce((sum, domain) => sum + domain.sourceCount, 0);
    const overall = domainSourceCount
      ? Math.round(domains.reduce((sum, domain) => sum + domain.score, 0) / domains.length)
      : 0;
    const orphanEvidence = evidence.filter(item => !item.checkpointId).length;
    const orphanPractice = practices.filter(item => !item.checkpointId).length;
    const orphanLibrary = library.filter(item =>
      !item.checkpointId && item.journeyConnection?.status !== "connected"
    ).length;
    return {
      overall,
      status: capabilityStatus(overall, domainSourceCount),
      domains,
      stages,
      systems,
      checkpointMetrics,
      orphan: {
        evidence: orphanEvidence,
        practice: orphanPractice,
        library: orphanLibrary,
        total: orphanEvidence + orphanPractice + orphanLibrary
      },
      calculation: "4つの能力領域を同じ重みで集約。各Checkpointは反映済みEvidence 50%・実践時間 30%・確信度 20%。審査中Evidenceは35%だけ暫定反映し、未接続領域は0%のまま表示。完了Checkpointは100%。"
    };
  }

  function growthLoopEdge(id, label, expected, connected, detail) {
    const required = Math.max(1, Number(expected) || 0);
    const actual = Math.max(0, Math.min(required, Number(connected) || 0));
    return {
      id,
      label,
      expected: required,
      connected: actual,
      percent: Math.round(actual / required * 100),
      status: actual === required ? "connected" : actual > 0 ? "partial" : "missing",
      page: detail?.page || "",
      whySo: detail?.whySo || `${actual}/${required}件が次の判断へ接続されています`,
      soWhat: detail?.soWhat || "未接続の入口と出口を確認し、次の判断へ渡す"
    };
  }

  function auditGrowthLoop(workspace) {
    const source = workspace && typeof workspace === "object" ? workspace : {};
    const checkpoints = asArray(source.journey?.checkpoints);
    const checkpointIds = new Set(checkpoints.map(item => item.id).filter(Boolean));
    const currentCheckpoint = checkpoints.find(item =>
      item.id === source.journey?.currentCheckpointId
    ) || checkpoints.find(item => item.status === "current") || null;
    const question = source.currentQuestion || source.issue || {};
    const models = asArray(source.modelBookings);
    const practices = asArray(source.practiceSessions);
    const evidence = asArray(source.evidenceRecords);
    const updates = asArray(source.journeyUpdates);
    const library = asArray(source.library);
    const requests = asArray(source.supportRequests);
    const support = asArray(source.supportSessions);
    const profile = source.visionProfile || {};
    const visionReady = Boolean(
      profile.statement &&
      !String(profile.statement).includes("設定してください")
    );
    const visionJourneyConnected = visionReady && checkpoints.some(item =>
      item.domain && (item.criteria || item.description)
    );
    const gapReady = Boolean(
      currentCheckpoint &&
      (question.whyNow || currentCheckpoint.gap || currentCheckpoint.routeReason)
    );
    const issueReady = Boolean(question.text || question.title || source.issue?.title);
    const issueCheckpointConnected = Boolean(
      issueReady &&
      question.checkpointId &&
      checkpointIds.has(question.checkpointId)
    );
    const currentModels = models.filter(model =>
      !currentCheckpoint || model.checkpointId === currentCheckpoint.id
    );
    const modelIds = new Set(models.map(item => item.id).filter(Boolean));
    const plannerPracticeConnected = practices.filter(item =>
      item.modelId && modelIds.has(item.modelId) &&
      (!item.checkpointId || checkpointIds.has(item.checkpointId))
    ).length;
    const practiceIds = new Set(practices.map(item => item.id).filter(Boolean));
    const evidenceByPractice = evidence.filter(item =>
      item.practiceId && practiceIds.has(item.practiceId)
    ).length;
    const evidenceIds = new Set(evidence.map(item => item.id).filter(Boolean));
    const updatesByEvidence = updates.filter(item =>
      item.evidenceId && evidenceIds.has(item.evidenceId)
    ).length;
    const appliedUpdates = updates.filter(item =>
      item.status === "applied" && item.proposedQuestion
    );
    const nextIssueConnected = appliedUpdates.filter(item =>
      issueReady && (
        item.proposedQuestion === question.text ||
        item.proposedQuestion === question.title ||
        item.checkpointId === question.checkpointId
      )
    ).length;
    const connectedLibrary = library.filter(item =>
      (item.checkpointId && checkpointIds.has(item.checkpointId)) ||
      item.journeyConnection?.status === "connected"
    ).length;
    const supportIds = new Set(support.map(item => item.id).filter(Boolean));
    const resolvedRequests = requests.filter(item =>
      item.status === "resolved" &&
      item.resolutionId &&
      supportIds.has(item.resolutionId)
    ).length;
    const edges = [
      growthLoopEdge("vision-journey", "Vision → Journey", 1, visionJourneyConnected ? 1 : 0, {
        page: "vision",
        whySo: visionJourneyConnected
          ? "完成像が能力領域と到達条件を持つCheckpointへ分解されています"
          : "VisionまたはVisionを分解したCheckpointが不足しています",
        soWhat: "Visionを4能力領域と判断工程へ分解し、Journeyへ配置する"
      }),
      growthLoopEdge("journey-gap", "Journey → Vision Gap", 1, gapReady ? 1 : 0, {
        page: "journey",
        whySo: gapReady
          ? "Current Checkpointに、現在地との差を示す根拠があります"
          : "Current Checkpointはありますが、Visionとの差を説明する根拠がありません",
        soWhat: "現在地と到達条件を比較し、なぜ今この差を扱うか言語化する"
      }),
      growthLoopEdge("gap-issue", "Vision Gap → 今回の問い", 1, gapReady && issueReady ? 1 : 0, {
        page: "issue",
        whySo: gapReady && issueReady
          ? "Visionとの差が、答えられる一つの問いへ変換されています"
          : "差分または今回の問いが未確定です",
        soWhat: "差分を、次のモデルで検証できる疑問文へ変換する"
      }),
      growthLoopEdge("issue-checkpoint", "今回の問い → Checkpoint", 1, issueCheckpointConnected ? 1 : 0, {
        page: "issue",
        whySo: issueCheckpointConnected
          ? "今回の問いはCurrent Checkpointへ一元接続されています"
          : "問いの編集元または対応Checkpointが特定できません",
        soWhat: "問いのSource of TruthをCurrent Checkpointへ接続する"
      }),
      growthLoopEdge("checkpoint-planner", "Checkpoint → Model Planner", 1, currentModels.length ? 1 : 0, {
        page: "planner",
        whySo: `${currentModels.length}件のモデル予定がCurrent Checkpointへ接続されています`,
        soWhat: "問いを検証できる骨格・髪質・メニュー条件のモデルを先に確保する"
      }),
      growthLoopEdge("planner-practice", "Model Planner → Practice", models.length, plannerPracticeConnected, {
        page: "practice",
        whySo: `${plannerPracticeConnected}/${Math.max(1, models.length)}件が予定からPracticeへ進んでいます`,
        soWhat: "予定したモデル条件と問いをPracticeへ引き継ぐ"
      }),
      growthLoopEdge("practice-evidence", "Practice → Evidence", practices.length, evidenceByPractice, {
        page: "evidence",
        whySo: `${evidenceByPractice}/${Math.max(1, practices.length)}件のPracticeがEvidenceへ変換されています`,
        soWhat: "実践を感想で終えず、事実・判断・Why So?・So What?で残す"
      }),
      growthLoopEdge("evidence-update", "Evidence → Journey Update", evidence.length, updatesByEvidence, {
        page: "evidence",
        whySo: `${updatesByEvidence}/${Math.max(1, evidence.length)}件のEvidenceにJourney反映判断があります`,
        soWhat: "Evidenceを審査し、現在地を更新・保留・棄却のいずれかに決める"
      }),
      growthLoopEdge("update-issue", "Journey Update → 次の問い", updates.length, nextIssueConnected, {
        page: "issue",
        whySo: `${nextIssueConnected}/${Math.max(1, updates.length)}件の更新が次の問いへ接続されています`,
        soWhat: "現在地の変化から、問いを維持・更新・完了のいずれかに決める"
      }),
      growthLoopEdge("library-loop", "Library → Journey / Checkpoint", library.length, connectedLibrary, {
        page: "library",
        whySo: `${connectedLibrary}/${Math.max(1, library.length)}件の知識資産が成長構造へ戻されています`,
        soWhat: "保存した知識をCheckpoint・次のPractice・Journeyのいずれかへ接続する"
      }),
      growthLoopEdge("support-loop", "Staff → Support → 次のPractice", requests.length, resolvedRequests, {
        page: "support",
        whySo: `${resolvedRequests}/${Math.max(1, requests.length)}件の依頼が判断修正まで完了しています`,
        soWhat: "Vision・問い・Checkpoint・Evidenceを渡し、比較質問と再検証条件を次のPracticeへ返す"
      })
    ];
    const connectedCount = edges.filter(item => item.status === "connected").length;
    const partialCount = edges.filter(item => item.status === "partial").length;
    const missingCount = edges.filter(item => item.status === "missing").length;
    return {
      edges,
      connectedCount,
      partialCount,
      missingCount,
      percent: Math.round(edges.reduce((sum, item) => sum + item.percent, 0) / edges.length),
      next: edges.find(item => item.status === "partial") ||
        edges.find(item => item.status === "missing") ||
        null,
      mece: {
        core: edges.slice(0, 9).map(item => item.id),
        crossLayer: edges.slice(9).map(item => item.id),
        statement: "コアループ9接続と横断レイヤー2接続を別の切り口として監査"
      }
    };
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
        judgmentStage: inferJudgmentStage(seed),
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
        evidenceIds: [],
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
        asArray(checkpoint.evidenceIds || checkpoint.evidenceItems).length === 0 &&
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
      evidenceIds: [],
      history: [],
      supportHistory: []
    };
  }

  function normalizeCheckpoint(checkpoint, index, deadline) {
    const base = defaultCheckpoint(index, deadline);
    const result = Object.assign(base, clone(checkpoint || {}));
    result.id = result.id || `cp${index + 1}`;
    result.code = result.code || `CP${index + 1}`;
    result.evidenceIds = asArray(result.evidenceIds);
    result.evidenceItems = asArray(result.evidenceItems);
    result.history = asArray(result.history);
    result.supportHistory = asArray(result.supportHistory);
    result.dependsOn = asArray(result.dependsOn);
    result.successConditions = asArray(result.successConditions);
    result.evidenceRequirements = asArray(result.evidenceRequirements);
    result.order = Number(result.order) || index + 1;
    result.domain = result.domain || "technical";
    result.judgmentStage = inferJudgmentStage(result);
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
      ) || source.visionProfile?.statement || "なりたい美容師像を設定してください",
      onboarding: clone(source.onboarding || {})
    };
    const visionProfile = normalizeVisionProfile(source.visionProfile, workspaceSeed);
    const evidenceRecords = asArray(source.evidenceRecords)
      .map((record, index) => normalizeEvidenceRecord(record, index, { staffId }));
    const evidenceIds = new Set(evidenceRecords.map(record => record.id));
    checkpoints.forEach(checkpoint => {
      asArray(checkpoint.evidenceItems).forEach((item, index) => {
        const record = normalizeEvidenceRecord(item, evidenceRecords.length, {
          staffId,
          checkpointId: checkpoint.id
        });
        if (!evidenceIds.has(record.id)) {
          evidenceRecords.push(record);
          evidenceIds.add(record.id);
        }
        checkpoint.evidenceIds.push(record.id);
      });
      checkpoint.evidenceIds = Array.from(new Set(checkpoint.evidenceIds)).filter(id =>
        evidenceRecords.some(record => record.id === id)
      );
      delete checkpoint.evidenceItems;
    });
    evidenceRecords.forEach(record => {
      const checkpoint = checkpoints.find(item => item.id === record.checkpointId);
      if (!record.domain && checkpoint) record.domain = checkpoint.domain;
      if (!record.judgmentStage && checkpoint) {
        record.judgmentStage = checkpoint.judgmentStage;
      }
    });
    const journeySeed = Object.assign({
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
    });
    const workspace = {
      staffId,
      visionProfile,
      deadline,
      hours: Math.max(0, Number(source.hours ?? source.weeklyHours ?? 6) || 0),
      overtimeHours: Math.max(0, Number(source.overtimeHours || 0) || 0),
      focusArea: source.focusArea || source.currentFocus || "技術",
      currentQuestion: normalizeCurrentQuestion(
        blank ? {} : source.currentQuestion,
        source,
        checkpoints
      ),
      journey: journeySeed,
      modelBookings: blank ? [] : asArray(source.modelBookings || source.modelPlans || source.models)
        .map(normalizeModelBooking),
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
      evidenceRecords: blank ? [] : evidenceRecords,
      journeyUpdates: blank ? [] : asArray(source.journeyUpdates).map(normalizeJourneyUpdate),
      supportRequests: blank ? [] : asArray(source.supportRequests).map((request, index) =>
        normalizeSupportRequest(request, index, {
          staffId,
          supportId: source.primarySupportId || ""
        })
      ),
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
    const metrics = deriveJourneyMetrics(workspace);
    workspace.journey.requiredHours = metrics.required;
    workspace.journey.actualHours = metrics.actual;
    return workspace;
  }

  function workspaceFromState(state, staffId, existing) {
    const next = Object.assign({}, clone(existing || {}));
    for (const key of WORKSPACE_KEYS) {
      if (key in (state || {})) next[key] = clone(state[key]);
    }
    next.evidenceRecords = asArray(next.evidenceRecords);
    asArray(next.journey?.checkpoints).forEach(checkpoint => {
      checkpoint.evidenceIds = asArray(checkpoint.evidenceIds);
      asArray(checkpoint.evidenceItems).forEach((item, index) => {
        let record = item?.id
          ? next.evidenceRecords.find(candidate => candidate.id === item.id)
          : null;
        if (!record) {
          record = normalizeEvidenceRecord(item, next.evidenceRecords.length + index, {
            staffId,
            checkpointId: checkpoint.id
          });
          next.evidenceRecords.push(record);
        }
        checkpoint.evidenceIds.push(record.id);
      });
      checkpoint.evidenceIds = Array.from(new Set(checkpoint.evidenceIds));
      delete checkpoint.evidenceItems;
    });
    next.visionProfile = normalizeVisionProfile(
      Object.assign({}, next.visionProfile || {}, {
        statement: cleanText(state?.visionProfile?.statement || state?.vision)
      }),
      state
    );
    next.currentQuestion = normalizeCurrentQuestion(
      Object.assign({}, state?.currentQuestion || {}, {
        text: cleanText(state?.issue?.title || state?.currentQuestion?.text),
        successConditions: asArray(
          state?.currentQuestion?.successConditions || state?.issue?.successConditions
        ),
        updatedAt: state?.issue?.updatedAt || state?.currentQuestion?.updatedAt || ""
      }),
      state,
      asArray(state?.journey?.checkpoints)
    );
    delete next.vision;
    delete next.issue;
    delete next.progress;
    delete next.planned;
    next.staffId = staffId;
    next.meta = Object.assign({}, next.meta || {}, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: isoNow()
    });
    return createWorkspace(staffId, next);
  }

  function stateFromWorkspace(workspace, sharedLibrary, role, page) {
    const result = clone(workspace);
    const metrics = deriveJourneyMetrics(result);
    result.vision = result.visionProfile?.statement || "";
    result.issue = Object.assign({}, result.currentQuestion || {}, {
      title: result.currentQuestion?.text || ""
    });
    result.progress = metrics.progress;
    result.planned = metrics.planned;
    asArray(result.journey?.checkpoints).forEach(checkpoint => {
      checkpoint.evidenceItems = asArray(checkpoint.evidenceIds)
        .map(id => asArray(result.evidenceRecords).find(record => record.id === id))
        .filter(Boolean);
    });
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
      checkpointId: "",
      domain: "",
      judgmentStage: "",
      evidenceIds: [],
      journeyConnection: { status: "pending", checkpointId: "", journeyItemId: "" },
      updatedBy: "System",
      updatedAt: "",
      updatedById: "",
      staffIds: [],
      history: []
    }, source, {
      image: source.image || images[0]?.src || "",
      images,
      comparison,
      evidenceIds: asArray(source.evidenceIds),
      journeyConnection: Object.assign({
        status: source.checkpointId ? "connected" : "pending",
        checkpointId: source.checkpointId || "",
        journeyItemId: ""
      }, source.journeyConnection || {}),
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
    JUDGMENT_STAGE_META,
    CAPABILITY_CATALOG,
    inferJudgmentStage,
    deriveCapabilityMap,
    auditGrowthLoop,
    createWorkspace,
    workspaceFromState,
    stateFromWorkspace,
    currentCheckpointOf,
    normalizeCurrentQuestion,
    normalizeEvidenceRecord,
    normalizeJourneyUpdate,
    normalizeSupportRequest,
    normalizeModelBooking,
    deriveJourneyMetrics,
    normalizeAsset,
    normalizeAssetImage,
    migrateLegacy,
    normalizeOrganizationPayload,
    exportPayload
  };
});
