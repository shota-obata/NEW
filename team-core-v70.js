;(function attachGrowthTeamCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GrowthTeamCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGrowthTeamCore() {
  "use strict";

  const SCHEMA_VERSION = 7;
  const WORKSPACE_KEYS = [
    "vision", "deadline", "hours", "overtimeHours", "focusArea",
    "progress", "planned", "issue", "journey", "modelBookings",
    "practiceSessions", "supportSessions", "practiceDraft", "libraryUi",
    "libraryRefs", "meta"
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
    return result;
  }

  function createWorkspace(staffId, seed, options) {
    const source = seed && typeof seed === "object" ? clone(seed) : {};
    const blank = Boolean(options?.blank);
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

    const workspace = {
      staffId,
      vision: blank ? "なりたい美容師像を設定してください" : (
        typeof source.vision === "object" ? source.vision.text : source.vision
      ) || "なりたい美容師像を設定してください",
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
      journey: Object.assign({}, sourceJourney, {
        checkpoints,
        history: blank ? [] : asArray(sourceJourney.history),
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
      meta: Object.assign({
        schemaVersion: SCHEMA_VERSION,
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

  function normalizeAsset(asset, index) {
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
      updatedBy: "System",
      updatedAt: "",
      updatedById: "",
      staffIds: [],
      history: []
    }, clone(asset || {}), {
      staffIds: asArray(asset?.staffIds),
      history: asArray(asset?.history)
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
    createWorkspace,
    workspaceFromState,
    stateFromWorkspace,
    normalizeAsset,
    migrateLegacy,
    normalizeOrganizationPayload,
    exportPayload
  };
});
