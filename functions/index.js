"use strict";

const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const REGION = "asia-northeast1";
const DEFAULT_ORGANIZATION_ID = "growth-os";
const BOOTSTRAP_KEY = defineSecret("GROWTH_BOOTSTRAP_KEY");
const ACCOUNT_COLLECTION = "growth_accounts";
const ATTEMPT_COLLECTION = "growth_auth_attempts";
const ORGANIZATION_COLLECTION = "growth_organizations";
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const MAX_PAYLOAD_BYTES = 900 * 1024;
const ALLOWED_ROLES = new Set(["staff", "support", "management"]);
const STAFF_WORKSPACE_KEYS = new Set([
  "visionProfile", "deadline", "hours", "overtimeHours", "focusArea",
  "currentQuestion", "journey", "modelBookings", "practiceSessions",
  "practiceDraft", "evidenceRecords", "libraryRefs", "onboarding", "meta"
]);
const SUPPORT_WORKSPACE_KEYS = new Set([
  "currentQuestion", "journey", "supportSessions", "supportRequests",
  "evidenceRecords", "journeyUpdates", "libraryRefs", "meta"
]);

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

function requirePin(value, field = "PIN") {
  const pin = String(value || "");
  if (!/^\d{4}$/.test(pin)) {
    throw new HttpsError("invalid-argument", `${field}は4桁の数字で入力してください。`);
  }
  return pin;
}

function requireOrganizationId(value) {
  const id = String(value || DEFAULT_ORGANIZATION_ID).trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(id)) {
    throw new HttpsError("invalid-argument", "Organization IDが正しくありません。");
  }
  return id;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requirePayloadSize(payload) {
  const bytes = Buffer.byteLength(JSON.stringify(payload || {}), "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new HttpsError(
      "failed-precondition",
      "クラウド保存容量を超えています。画像を減らしてから再度保存してください。"
    );
  }
  return bytes;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hashIdentifier(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function createSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function derivePinHash(pin, salt) {
  return crypto.scryptSync(pin, salt, 64).toString("hex");
}

function pinMatches(pin, salt, expected) {
  const actualBuffer = Buffer.from(derivePinHash(pin, salt), "hex");
  const expectedBuffer = Buffer.from(String(expected || ""), "hex");
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function authClaims(request) {
  const token = request.auth?.token || {};
  const role = String(token.role || "");
  const memberId = String(token.memberId || "");
  const organizationId = String(token.organizationId || "");
  if (!request.auth || !ALLOWED_ROLES.has(role) || !memberId || !organizationId) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  return {
    uid: request.auth.uid,
    role,
    memberId,
    loginId: String(token.loginId || ""),
    organizationId
  };
}

function accountDocId(organizationId, loginId) {
  return hashIdentifier(`${organizationId}:${loginId}`);
}

function attemptDocId(organizationId, loginId, ip) {
  return hashIdentifier(`${organizationId}:${loginId}:${ip || "unknown"}`);
}

function memberList(payload, role) {
  const organization = payload?.organization || {};
  if (role === "staff") return asArray(organization.staffMembers);
  if (role === "support") return asArray(organization.supportMembers);
  return asArray(organization.managementMembers);
}

function memberExists(payload, role, memberId) {
  return memberList(payload, role).some(member =>
    member.id === memberId && member.status !== "archived"
  );
}

function assignedStaffIds(payload, claims) {
  if (claims.role === "management") {
    return memberList(payload, "staff").map(member => member.id);
  }
  if (claims.role === "staff") return [claims.memberId];
  const support = memberList(payload, "support")
    .find(member => member.id === claims.memberId);
  return asArray(support?.staffIds);
}

function scopeLibrary(payload, staffIds, role) {
  const library = asArray(payload?.organization?.library);
  if (role === "management") return library;
  return library.filter(asset => {
    const linked = asArray(asset.staffIds);
    return !linked.length || linked.some(id => staffIds.includes(id));
  });
}

function scopedPayload(payload, claims) {
  const source = clone(payload || {});
  const staffIds = assignedStaffIds(source, claims);
  const organization = source.organization || {};
  const signedStaffIds = new Set(staffIds);
  const visibleSupportIds = new Set();
  for (const staff of asArray(organization.staffMembers)) {
    if (!signedStaffIds.has(staff.id)) continue;
    for (const supportId of asArray(staff.supportMemberIds)) visibleSupportIds.add(supportId);
    if (staff.primarySupportId) visibleSupportIds.add(staff.primarySupportId);
  }
  const workspaces = {};
  for (const staffId of staffIds) {
    if (source.staffWorkspaces?.[staffId]) {
      workspaces[staffId] = source.staffWorkspaces[staffId];
    }
  }
  source.staffWorkspaces = workspaces;
  source.organization = organization;
  if (claims.role !== "management") {
    source.organization.staffMembers = asArray(organization.staffMembers)
      .filter(member => signedStaffIds.has(member.id));
    source.organization.supportMembers = asArray(organization.supportMembers)
      .filter(member => member.id === claims.memberId || visibleSupportIds.has(member.id));
    source.organization.managementMembers = [];
  }
  source.organization.library = scopeLibrary(source, staffIds, claims.role);
  source.organization.activeStaffId = staffIds.includes(source.organization.activeStaffId)
    ? source.organization.activeStaffId
    : staffIds[0] || "";
  source.organization.auditLog = claims.role === "management"
    ? asArray(source.organization.auditLog)
    : asArray(source.organization.auditLog).filter(entry =>
      staffIds.includes(entry.targetStaffId) &&
      (entry.actorId === claims.memberId || entry.targetStaffId === claims.memberId)
    );
  return source;
}

function preserveResolvedRequest(current, proposed) {
  const currentById = new Map(asArray(current).map(item => [item.id, item]));
  const result = asArray(proposed).map(item => {
    const previous = currentById.get(item.id);
    if (!previous || previous.status === "pending") {
      return Object.assign({}, item, {
        status: "pending",
        acknowledgedAt: "",
        acknowledgedBy: "",
        resolvedAt: "",
        resolvedBy: "",
        resolutionId: ""
      });
    }
    return previous;
  });
  for (const previous of asArray(current)) {
    if (previous.status === "pending") continue;
    if (!result.some(item => item.id === previous.id)) result.push(previous);
  }
  return result;
}

function mergeEvidenceForSupport(current, proposed, claims) {
  const proposedById = new Map(asArray(proposed).map(item => [item.id, item]));
  const result = asArray(current).map(item => {
    const next = proposedById.get(item.id);
    if (!next) return item;
    return Object.assign({}, item, {
      journeyImpact: clone(next.journeyImpact || item.journeyImpact),
      libraryAssetIds: asArray(next.libraryAssetIds || item.libraryAssetIds),
      updatedAt: next.updatedAt || new Date().toISOString()
    });
  });
  for (const item of asArray(proposed)) {
    if (result.some(existing => existing.id === item.id)) continue;
    result.push(Object.assign({}, item, {
      createdById: claims.memberId,
      createdByRole: "support"
    }));
  }
  return result;
}

function mergeJourneyForSupport(current, proposed) {
  const next = clone(current || {});
  const currentCheckpoints = new Map(asArray(current?.checkpoints).map(item => [item.id, item]));
  next.currentCheckpointId = proposed?.currentCheckpointId || current?.currentCheckpointId || "";
  const proposedCheckpoints = new Map(asArray(proposed?.checkpoints).map(item => [item.id, item]));
  next.checkpoints = asArray(current?.checkpoints).map(currentItem => {
    const item = proposedCheckpoints.get(currentItem.id);
    if (!item) return currentItem;
    proposedCheckpoints.delete(currentItem.id);
    const previous = currentCheckpoints.get(item.id) || {};
    return Object.assign({}, previous, {
      status: item.status || previous.status,
      issue: item.issue ?? previous.issue,
      confidence: item.confidence ?? previous.confidence,
      evidenceIds: asArray(item.evidenceIds || previous.evidenceIds),
      supportHistory: asArray(item.supportHistory || previous.supportHistory),
      history: asArray(item.history || previous.history)
    });
  });
  for (const item of proposedCheckpoints.values()) {
    next.checkpoints.push(Object.assign({}, item, {
      status: item.status || "next"
    }));
  }
  next.history = asArray(proposed?.history || current?.history);
  return next;
}

function mergeWorkspace(current, proposed, claims) {
  const source = clone(current || {});
  const incoming = clone(proposed || {});
  if (claims.role === "management") return incoming;
  if (claims.role === "staff") {
    for (const key of STAFF_WORKSPACE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) source[key] = incoming[key];
    }
    source.supportSessions = asArray(current?.supportSessions);
    source.supportRequests = preserveResolvedRequest(
      current?.supportRequests,
      incoming?.supportRequests
    );
    source.journeyUpdates = asArray(incoming?.journeyUpdates).map(item => {
      const existing = asArray(current?.journeyUpdates).find(entry => entry.id === item.id);
      if (existing?.status === "applied" || existing?.status === "rejected") return existing;
      return Object.assign({}, item, { status: "pending" });
    });
    return source;
  }
  for (const key of SUPPORT_WORKSPACE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    if (key === "journey") source.journey = mergeJourneyForSupport(current?.journey, incoming.journey);
    else if (key === "evidenceRecords") {
      source.evidenceRecords = mergeEvidenceForSupport(
        current?.evidenceRecords,
        incoming.evidenceRecords,
        claims
      );
    } else source[key] = incoming[key];
  }
  return source;
}

function mergeLibrary(current, proposed, claims, allowedStaffIds) {
  if (claims.role === "management") return asArray(proposed);
  const result = asArray(current).map(clone);
  const indexById = new Map(result.map((item, index) => [item.id, index]));
  for (const asset of asArray(proposed)) {
    const linkedStaffIds = asArray(asset.staffIds);
    const canTouch = !linkedStaffIds.length ||
      linkedStaffIds.some(id => allowedStaffIds.includes(id));
    if (!canTouch) continue;
    const index = indexById.get(asset.id);
    if (index === undefined) {
      const next = Object.assign({}, asset, {
        createdById: asset.createdById || claims.memberId,
        createdByRole: asset.createdByRole || claims.role
      });
      result.push(next);
      indexById.set(next.id, result.length - 1);
      continue;
    }
    const previous = result[index];
    const ownsAsset = previous.createdById === claims.memberId ||
      linkedStaffIds.some(id => allowedStaffIds.includes(id));
    if (ownsAsset || claims.role === "support") result[index] = asset;
  }
  return result;
}

function mergePayload(current, proposed, claims) {
  const result = clone(current || proposed || {});
  const incoming = clone(proposed || {});
  if (claims.role === "management") return incoming;
  result.organization = result.organization || {};
  result.staffWorkspaces = result.staffWorkspaces || {};
  const allowedStaffIds = assignedStaffIds(result, claims);
  for (const staffId of allowedStaffIds) {
    if (!incoming.staffWorkspaces?.[staffId]) continue;
    result.staffWorkspaces[staffId] = mergeWorkspace(
      result.staffWorkspaces[staffId],
      incoming.staffWorkspaces[staffId],
      claims
    );
  }
  result.organization.library = mergeLibrary(
    current?.organization?.library,
    incoming?.organization?.library,
    claims,
    allowedStaffIds
  );
  result.organization.updatedAt = new Date().toISOString();
  return result;
}

exports.pinLogin = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const organizationId = requireOrganizationId(request.data?.organizationId);
  const loginId = normalizeLoginId(request.data?.loginId);
  const pin = requirePin(request.data?.pin);
  if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) {
    throw new HttpsError("permission-denied", "個人IDまたはPINが違います。");
  }
  const accountRef = db.collection(ACCOUNT_COLLECTION)
    .doc(accountDocId(organizationId, loginId));
  const attemptRef = db.collection(ATTEMPT_COLLECTION)
    .doc(attemptDocId(organizationId, loginId, request.rawRequest?.ip));
  const [accountSnapshot, attemptSnapshot] = await Promise.all([
    accountRef.get(),
    attemptRef.get()
  ]);
  const attempt = attemptSnapshot.data() || {};
  const now = Date.now();
  const lockedUntil = attempt.lockedUntil?.toMillis?.() || 0;
  if (lockedUntil > now) {
    throw new HttpsError("resource-exhausted", "しばらく待ってから再度お試しください。");
  }
  const account = accountSnapshot.data();
  const valid = Boolean(
    account?.active !== false &&
    account?.organizationId === organizationId &&
    pinMatches(pin, account?.salt, account?.pinHash)
  );
  if (!valid) {
    const failures = Number(attempt.failures || 0) + 1;
    const lock = failures >= MAX_FAILURES;
    await attemptRef.set({
      failures: lock ? 0 : failures,
      lockedUntil: lock
        ? new Date(now + LOCK_MINUTES * 60 * 1000)
        : null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw new HttpsError("permission-denied", "個人IDまたはPINが違います。");
  }
  const organizationSnapshot = await db.collection(ORGANIZATION_COLLECTION)
    .doc(organizationId).get();
  const payload = organizationSnapshot.data()?.payload;
  if (!payload || !memberExists(payload, account.role, account.memberId)) {
    throw new HttpsError("failed-precondition", "アカウントと人物データが接続されていません。");
  }
  await attemptRef.delete().catch(() => {});
  const uid = account.uid || `growth-${accountDocId(organizationId, loginId).slice(0, 24)}`;
  await getAuth().getUser(uid).catch(async error => {
    if (error.code !== "auth/user-not-found") throw error;
    await getAuth().createUser({ uid, displayName: account.displayName || loginId });
  });
  const claims = {
    role: account.role,
    memberId: account.memberId,
    organizationId,
    loginId
  };
  await getAuth().setCustomUserClaims(uid, claims);
  const token = await getAuth().createCustomToken(uid, claims);
  await accountRef.set({
    uid,
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    token,
    account: {
      id: `cloud-${account.role}-${account.memberId}`,
      memberId: account.memberId,
      role: account.role,
      loginId,
      organizationId,
      cloud: true
    }
  };
});

exports.loadGrowthState = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const claims = authClaims(request);
  const organizationId = requireOrganizationId(request.data?.organizationId);
  if (claims.organizationId !== organizationId) {
    throw new HttpsError("permission-denied", "この組織へアクセスできません。");
  }
  const snapshot = await db.collection(ORGANIZATION_COLLECTION).doc(organizationId).get();
  if (!snapshot.exists) {
    throw new HttpsError("failed-precondition", "クラウド組織データが未設定です。");
  }
  const data = snapshot.data() || {};
  return {
    payload: scopedPayload(data.payload, claims),
    revision: Number(data.revision) || 0,
    serverUpdatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || ""
  };
});

exports.saveGrowthState = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const claims = authClaims(request);
  const organizationId = requireOrganizationId(request.data?.organizationId);
  const proposed = request.data?.payload;
  if (claims.organizationId !== organizationId || !proposed?.organization) {
    throw new HttpsError("permission-denied", "保存できません。");
  }
  const ref = db.collection(ORGANIZATION_COLLECTION).doc(organizationId);
  const revision = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "クラウド組織データが未設定です。");
    }
    const current = snapshot.data() || {};
    const merged = mergePayload(current.payload, proposed, claims);
    requirePayloadSize(merged);
    if (!memberExists(merged, claims.role, claims.memberId)) {
      throw new HttpsError("permission-denied", "人物データとの接続がありません。");
    }
    const nextRevision = Number(current.revision || 0) + 1;
    transaction.set(ref, {
      payload: merged,
      revision: nextRevision,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: claims.memberId,
      updatedByRole: claims.role
    }, { merge: true });
    return nextRevision;
  });
  return { ok: true, revision };
});

exports.changeGrowthPin = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const claims = authClaims(request);
  const organizationId = requireOrganizationId(request.data?.organizationId);
  const currentPin = requirePin(request.data?.currentPin, "現在のPIN");
  const nextPin = requirePin(request.data?.nextPin, "新しいPIN");
  if (claims.organizationId !== organizationId || currentPin === nextPin) {
    throw new HttpsError("invalid-argument", "新しいPINを確認してください。");
  }
  const ref = db.collection(ACCOUNT_COLLECTION)
    .doc(accountDocId(organizationId, claims.loginId));
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const account = snapshot.data();
    if (!account || !pinMatches(currentPin, account.salt, account.pinHash)) {
      throw new HttpsError("permission-denied", "現在のPINが違います。");
    }
    const salt = createSalt();
    transaction.update(ref, {
      salt,
      pinHash: derivePinHash(nextPin, salt),
      pinChangedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

exports.listGrowthAccounts = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const claims = authClaims(request);
  const organizationId = requireOrganizationId(request.data?.organizationId);
  if (claims.role !== "management" || claims.organizationId !== organizationId) {
    throw new HttpsError("permission-denied", "Managementのみ操作できます。");
  }
  const snapshot = await db.collection(ACCOUNT_COLLECTION)
    .where("organizationId", "==", organizationId)
    .get();
  return {
    accounts: snapshot.docs.map(document => {
      const account = document.data();
      return {
        id: document.id,
        loginId: account.loginId || "",
        memberId: account.memberId || "",
        role: account.role || "",
        displayName: account.displayName || "",
        active: account.active !== false,
        createdAt: account.createdAt?.toDate?.()?.toISOString?.() || "",
        lastLoginAt: account.lastLoginAt?.toDate?.()?.toISOString?.() || ""
      };
    })
  };
});

exports.provisionGrowthAccount = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const claims = authClaims(request);
  const organizationId = requireOrganizationId(request.data?.organizationId);
  const loginId = normalizeLoginId(request.data?.loginId);
  const pin = requirePin(request.data?.pin);
  const role = String(request.data?.role || "");
  const memberId = String(request.data?.memberId || "");
  if (claims.role !== "management" || claims.organizationId !== organizationId) {
    throw new HttpsError("permission-denied", "Managementのみ操作できます。");
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(loginId) || !ALLOWED_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "個人IDまたは役割を確認してください。");
  }
  const organizationSnapshot = await db.collection(ORGANIZATION_COLLECTION)
    .doc(organizationId).get();
  const payload = organizationSnapshot.data()?.payload;
  if (!payload || !memberExists(payload, role, memberId)) {
    throw new HttpsError("invalid-argument", "Growth OSの人物データが見つかりません。");
  }
  const ref = db.collection(ACCOUNT_COLLECTION)
    .doc(accountDocId(organizationId, loginId));
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", "この個人IDはすでに使われています。");
  }
  const duplicate = await db.collection(ACCOUNT_COLLECTION)
    .where("organizationId", "==", organizationId)
    .where("memberId", "==", memberId)
    .where("role", "==", role)
    .limit(1)
    .get();
  if (!duplicate.empty) {
    throw new HttpsError("already-exists", "この人物にはすでにアカウントがあります。");
  }
  const salt = createSalt();
  const member = memberList(payload, role).find(item => item.id === memberId);
  await ref.create({
    organizationId,
    loginId,
    memberId,
    role,
    displayName: member?.name || loginId,
    salt,
    pinHash: derivePinHash(pin, salt),
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: claims.memberId
  });
  return { ok: true };
});

exports.setGrowthAccountStatus = onCall({
  region: REGION,
  enforceAppCheck: false,
  cors: true
}, async request => {
  const claims = authClaims(request);
  const organizationId = requireOrganizationId(request.data?.organizationId);
  const accountId = String(request.data?.accountId || "");
  const active = request.data?.active === true;
  if (claims.role !== "management" || claims.organizationId !== organizationId) {
    throw new HttpsError("permission-denied", "Managementのみ操作できます。");
  }
  const ref = db.collection(ACCOUNT_COLLECTION).doc(accountId);
  const snapshot = await ref.get();
  const account = snapshot.data();
  if (!account || account.organizationId !== organizationId) {
    throw new HttpsError("not-found", "アカウントが見つかりません。");
  }
  if (account.memberId === claims.memberId && account.role === "management" && !active) {
    throw new HttpsError("failed-precondition", "ログイン中のManagementは停止できません。");
  }
  await ref.update({
    active,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: claims.memberId
  });
  if (account.uid && !active) {
    await getAuth().revokeRefreshTokens(account.uid);
  }
  return { ok: true };
});

exports.bootstrapGrowth = onCall({
  region: REGION,
  secrets: [BOOTSTRAP_KEY],
  enforceAppCheck: false,
  cors: true
}, async request => {
  const organizationId = requireOrganizationId(request.data?.organizationId);
  const bootstrapKey = String(request.data?.bootstrapKey || "");
  if (!bootstrapKey || bootstrapKey !== BOOTSTRAP_KEY.value()) {
    throw new HttpsError("permission-denied", "初期設定キーが違います。");
  }
  const payload = request.data?.payload;
  const loginId = normalizeLoginId(request.data?.loginId);
  const pin = requirePin(request.data?.pin);
  const memberId = String(request.data?.memberId || "");
  if (!payload?.organization || !memberExists(payload, "management", memberId)) {
    throw new HttpsError("invalid-argument", "Management人物データが見つかりません。");
  }
  requirePayloadSize(payload);
  if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) {
    throw new HttpsError("invalid-argument", "個人IDを確認してください。");
  }
  const orgRef = db.collection(ORGANIZATION_COLLECTION).doc(organizationId);
  const accountRef = db.collection(ACCOUNT_COLLECTION)
    .doc(accountDocId(organizationId, loginId));
  await db.runTransaction(async transaction => {
    const [orgSnapshot, accountSnapshot] = await Promise.all([
      transaction.get(orgRef),
      transaction.get(accountRef)
    ]);
    if (orgSnapshot.exists || accountSnapshot.exists) {
      throw new HttpsError("already-exists", "初期設定はすでに完了しています。");
    }
    const salt = createSalt();
    transaction.create(orgRef, {
      payload,
      revision: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: memberId,
      updatedByRole: "management"
    });
    transaction.create(accountRef, {
      organizationId,
      loginId,
      memberId,
      role: "management",
      displayName: memberList(payload, "management")
        .find(member => member.id === memberId)?.name || "Management",
      salt,
      pinHash: derivePinHash(pin, salt),
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

if (process.env.GROWTH_POLICY_TEST === "1") {
  exports.__policy = {
    assignedStaffIds,
    scopedPayload,
    preserveResolvedRequest,
    mergeJourneyForSupport,
    mergeWorkspace,
    mergePayload,
    requirePayloadSize,
    derivePinHash,
    pinMatches
  };
}
