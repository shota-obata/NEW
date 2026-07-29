(() => {
  "use strict";
  if (window.__growthCloudV80) return;
  window.__growthCloudV80 = true;

  const config = window.GROWTH_CLOUD_CONFIG || {};
  const configured = Boolean(
    config.enabled &&
    config.firebase?.apiKey &&
    config.firebase?.projectId &&
    config.firebase?.appId
  );
  const CLOUD_STATUS_EVENT = "growth:cloud-status";
  const CLOUD_PAYLOAD_EVENT = "growth:cloud-payload";
  const PENDING_SAVE_KEY = "growthOS.cloud.pending.v80";
  const ACCOUNT_COLLECTION = "growth_accounts";
  const ORGANIZATION_COLLECTION = "growth_organizations";
  const sdkVersion = String(config.sdkVersion || "12.16.0");
  const organizationId = String(config.organizationId || "growth-os");
  const MAX_DOCUMENT_BYTES = 850 * 1024;
  const WORKSPACE_SEGMENTS = Object.freeze({
    profile: [
      "staffId", "primarySupportId", "supportMemberIds", "visionProfile",
      "deadline", "hours", "overtimeHours", "focusArea", "onboarding", "meta",
      "libraryUi"
    ],
    journey: ["currentQuestion", "journey", "journeyUpdates"],
    planner: ["modelBookings"],
    practice: ["practiceSessions", "practiceDraft"],
    evidence: ["evidenceRecords", "libraryRefs"],
    supportRequests: ["supportRequests"],
    supportSessions: ["supportSessions"]
  });
  const ROLE_SEGMENTS = Object.freeze({
    staff: [
      "profile", "journey", "planner", "practice", "evidence", "supportRequests"
    ],
    support: [
      "journey", "evidence", "supportRequests", "supportSessions"
    ],
    management: Object.keys(WORKSPACE_SEGMENTS)
  });

  let appModule = null;
  let authApi = null;
  let firestoreApi = null;
  let app = null;
  let auth = null;
  let db = null;
  let signedAccount = null;
  let cloudRevision = 0;
  let saveTimer = null;
  let queuedPayload = null;
  let saveInFlight = false;
  let saveFailures = 0;
  let initialized = false;

  function emitStatus(status, detail = "") {
    document.documentElement.dataset.cloudStatus = status;
    window.dispatchEvent(new CustomEvent(CLOUD_STATUS_EVENT, {
      detail: { status, detail, configured }
    }));
  }

  function normalizeLoginId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validateLoginId(value) {
    const loginId = normalizeLoginId(value);
    if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) {
      throw new Error("個人IDは3〜32文字の半角英数字・._-で入力してください。");
    }
    return loginId;
  }

  function validatePin(value, field = "PIN") {
    const pin = String(value || "");
    if (!/^\d{4}$/.test(pin)) {
      throw new Error(`${field}は4桁の数字で入力してください。`);
    }
    return pin;
  }

  function bytesToBase64Url(bytes) {
    let text = "";
    bytes.forEach(byte => { text += String.fromCharCode(byte); });
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function sha256(value) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(String(value || ""))
    );
    return new Uint8Array(digest);
  }

  async function loginEmail(loginId) {
    const digest = await sha256(`${organizationId}:${validateLoginId(loginId)}`);
    return `${Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("")}@growth-os.invalid`;
  }

  async function pinPassword(loginId, pin) {
    const normalized = validateLoginId(loginId);
    const checkedPin = validatePin(pin);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(checkedPin),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 120000,
      salt: new TextEncoder().encode(`growth-os:v1:${organizationId}:${normalized}`)
    }, key, 256);
    return `GOS1-${bytesToBase64Url(new Uint8Array(bits))}`;
  }

  function sanitize(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function serializedBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
  }

  function assertDocumentSize(value, label) {
    if (serializedBytes(value) > MAX_DOCUMENT_BYTES) {
      throw new Error(
        `${label}のクラウド保存上限を超えています。大きな画像は端末内に残し、共有用画像を小さくしてください。`
      );
    }
  }

  function readPendingSaves() {
    try {
      const stored = JSON.parse(localStorage.getItem(PENDING_SAVE_KEY) || "{}");
      return stored && typeof stored === "object" ? stored : {};
    } catch (_) {
      return {};
    }
  }

  function accountSaveKey(account = signedAccount) {
    if (!account?.role || !account?.memberId) return "";
    return `${organizationId}:${account.role}:${account.memberId}`;
  }

  function persistPendingSave(payload) {
    const key = accountSaveKey();
    if (!key || !payload) return;
    try {
      const pending = readPendingSaves();
      pending[key] = { payload, savedAt: new Date().toISOString() };
      localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(pending));
    } catch (_) {
      // team-v70 always retains the latest canonical local snapshot.
    }
  }

  function clearPendingSave() {
    const key = accountSaveKey();
    if (!key) return;
    const pending = readPendingSaves();
    delete pending[key];
    if (Object.keys(pending).length) {
      try {
        localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(pending));
      } catch (_) {
        // Keep the canonical local snapshot even if the auxiliary queue is full.
      }
    } else {
      localStorage.removeItem(PENDING_SAVE_KEY);
    }
  }

  function restorePendingSave() {
    const key = accountSaveKey();
    const pending = key ? readPendingSaves()[key] : null;
    if (!pending?.payload) return false;
    queuedPayload = pending.payload;
    scheduleSave(queuedPayload, 1200);
    return true;
  }

  function cloudError(error, fallback) {
    const code = String(error?.code || "");
    if (
      code.includes("invalid-credential") ||
      code.includes("wrong-password") ||
      code.includes("user-not-found")
    ) {
      return new Error("個人IDまたはPINが違います。");
    }
    if (code.includes("too-many-requests")) {
      return new Error("試行回数が多いため、少し待ってから再度お試しください。");
    }
    if (code.includes("permission-denied") || code.includes("unauthenticated")) {
      return new Error("このアカウントには、そのデータを操作する権限がありません。");
    }
    if (code.includes("network-request-failed") || code.includes("unavailable")) {
      return new Error("クラウドへ接続できません。通信状態を確認してください。");
    }
    if (code.includes("email-already-in-use")) {
      return new Error("その個人IDはすでに使われています。");
    }
    return new Error(error?.message || fallback);
  }

  async function loadSdk() {
    if (!configured || initialized) return configured;
    emitStatus("connecting", "Firebaseへ接続中");
    const base = `https://www.gstatic.com/firebasejs/${sdkVersion}`;
    [appModule, authApi, firestoreApi] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);
    app = appModule.initializeApp(config.firebase);
    auth = authApi.getAuth(app);
    db = firestoreApi.getFirestore(app);
    await authApi.setPersistence(auth, authApi.browserLocalPersistence);
    initialized = true;
    emitStatus("ready", "クラウド接続済み");
    return true;
  }

  function accountRef(uid) {
    return firestoreApi.doc(db, ACCOUNT_COLLECTION, uid);
  }

  function organizationRef() {
    return firestoreApi.doc(db, ORGANIZATION_COLLECTION, organizationId);
  }

  function staffSegmentRef(staffId, segmentId) {
    return firestoreApi.doc(
      db,
      ORGANIZATION_COLLECTION,
      organizationId,
      "staff",
      staffId,
      "segments",
      segmentId
    );
  }

  function libraryCollectionRef() {
    return firestoreApi.collection(
      db,
      ORGANIZATION_COLLECTION,
      organizationId,
      "library"
    );
  }

  async function readAccount(user) {
    const snapshot = await firestoreApi.getDoc(accountRef(user.uid));
    if (!snapshot.exists()) {
      throw new Error("このログイン情報はGrowth OSの人物に接続されていません。");
    }
    const data = snapshot.data() || {};
    if (
      data.organizationId !== organizationId ||
      !["staff", "support", "management"].includes(data.role) ||
      !data.memberId
    ) {
      throw new Error("アカウントの接続情報が正しくありません。");
    }
    if (data.active !== true || data.memberActive === false) {
      throw new Error("このアカウントは現在停止されています。");
    }
    return {
      id: snapshot.id,
      uid: user.uid,
      memberId: String(data.memberId),
      role: String(data.role),
      loginId: String(data.loginId || ""),
      displayName: String(data.displayName || data.loginId || ""),
      organizationId,
      staffIds: Array.isArray(data.staffIds) ? data.staffIds.slice() : [],
      cloud: true
    };
  }

  function visibleStaffIds(organization, account = signedAccount) {
    const all = (organization?.staffMembers || [])
      .filter(member => member.status !== "archived")
      .map(member => member.id);
    if (account?.role === "management") return all;
    if (account?.role === "staff") return [account.memberId];
    return (account?.staffIds || []).filter(id => all.includes(id));
  }

  function scopeOrganization(organization, account = signedAccount) {
    const source = sanitize(organization || {});
    const staffIds = visibleStaffIds(source, account);
    const staffIdSet = new Set(staffIds);
    if (account?.role === "management") return source;
    const visibleSupportIds = new Set();
    for (const staff of source.staffMembers || []) {
      if (!staffIdSet.has(staff.id)) continue;
      (staff.supportMemberIds || []).forEach(id => visibleSupportIds.add(id));
      if (staff.primarySupportId) visibleSupportIds.add(staff.primarySupportId);
    }
    source.staffMembers = (source.staffMembers || [])
      .filter(member => staffIdSet.has(member.id));
    source.supportMembers = (source.supportMembers || [])
      .filter(member => (
        member.id === account?.memberId ||
        visibleSupportIds.has(member.id)
      ));
    source.managementMembers = [];
    source.auditLog = (source.auditLog || []).filter(entry =>
      staffIdSet.has(entry.targetStaffId)
    );
    source.activeStaffId = staffIds.includes(source.activeStaffId)
      ? source.activeStaffId
      : staffIds[0] || "";
    if (account?.role === "support") source.activeSupportId = account.memberId;
    return source;
  }

  function splitWorkspace(workspace) {
    const source = workspace && typeof workspace === "object" ? workspace : {};
    const segments = {};
    for (const [segmentId, keys] of Object.entries(WORKSPACE_SEGMENTS)) {
      const data = { staffId: source.staffId || "" };
      for (const key of keys) {
        if (key in source) data[key] = sanitize(source[key]);
      }
      segments[segmentId] = data;
    }
    return segments;
  }

  function mergeSegments(staffId, entries) {
    const workspace = { staffId };
    entries.forEach(entry => Object.assign(workspace, entry || {}));
    return workspace;
  }

  async function loadWorkspace(staffId) {
    const ids = Object.keys(WORKSPACE_SEGMENTS);
    const snapshots = await Promise.all(ids.map(segmentId =>
      firestoreApi.getDoc(staffSegmentRef(staffId, segmentId))
    ));
    const parts = snapshots
      .filter(snapshot => snapshot.exists())
      .map(snapshot => snapshot.data());
    return parts.length ? mergeSegments(staffId, parts) : null;
  }

  function visibleLibraryAssets(assets, account, staffIds) {
    if (account?.role === "management") return assets;
    return assets.filter(asset => {
      const linked = Array.isArray(asset.staffIds) ? asset.staffIds : [];
      return !linked.length || linked.some(id => staffIds.includes(id));
    });
  }

  async function loadState() {
    await loadSdk();
    if (!auth?.currentUser || !signedAccount) return null;
    try {
      emitStatus("connecting", "クラウドから読込中");
      const organizationSnapshot = await firestoreApi.getDoc(organizationRef());
      if (!organizationSnapshot.exists()) {
        if (signedAccount.role !== "management") {
          throw new Error("組織データの初期設定がまだ完了していません。");
        }
        const localPayload = window.GrowthTeam?.getPayload?.();
        if (localPayload?.organization) {
          queuedPayload = localPayload;
          await performSave();
          return { revision: cloudRevision, payload: localPayload };
        }
        return { revision: 0, payload: null };
      }
      const organization = organizationSnapshot.data() || {};
      cloudRevision = Number(organization.cloudRevision) || 0;
      const staffIds = visibleStaffIds(organization, signedAccount);
      const workspaceEntries = await Promise.all(staffIds.map(async staffId => (
        [staffId, await loadWorkspace(staffId)]
      )));
      const librarySnapshot = await firestoreApi.getDocs(libraryCollectionRef());
      const assets = librarySnapshot.docs.map(snapshot => Object.assign(
        { id: snapshot.id },
        snapshot.data()
      ));
      const scopedOrganization = scopeOrganization(organization, signedAccount);
      scopedOrganization.library = visibleLibraryAssets(assets, signedAccount, staffIds);
      const payload = {
        format: "growth-os-organization",
        schemaVersion: Number(organization.schemaVersion) || 10,
        organization: scopedOrganization,
        staffWorkspaces: Object.fromEntries(
          workspaceEntries.filter(([, workspace]) => workspace)
        )
      };
      window.GrowthTeam?.replacePayload?.(payload, {
        source: "cloud",
        revision: cloudRevision
      });
      window.dispatchEvent(new CustomEvent(CLOUD_PAYLOAD_EVENT, {
        detail: { revision: cloudRevision }
      }));
      emitStatus("synced", "クラウド同期済み");
      return { revision: cloudRevision, payload };
    } catch (error) {
      emitStatus("error", error?.message || "クラウド読込エラー");
      throw cloudError(error, "クラウドデータを読み込めませんでした。");
    }
  }

  async function login(loginId, pin) {
    await loadSdk();
    const normalized = validateLoginId(loginId);
    try {
      emitStatus("connecting", "認証中");
      const credential = await authApi.signInWithEmailAndPassword(
        auth,
        await loginEmail(normalized),
        await pinPassword(normalized, pin)
      );
      signedAccount = await readAccount(credential.user);
      const state = await loadState();
      restorePendingSave();
      emitStatus("synced", "クラウド同期済み");
      return { account: { ...signedAccount }, payload: state?.payload || null };
    } catch (error) {
      await authApi.signOut(auth).catch(() => {});
      signedAccount = null;
      emitStatus("error", "ログインできませんでした");
      throw cloudError(error, "ログインできませんでした。");
    }
  }

  async function restore() {
    if (!configured) return null;
    await loadSdk();
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    try {
      signedAccount = await readAccount(auth.currentUser);
      const state = await loadState();
      restorePendingSave();
      emitStatus("synced", "クラウド同期済み");
      return { account: { ...signedAccount }, payload: state?.payload || null };
    } catch (error) {
      await authApi.signOut(auth).catch(() => {});
      signedAccount = null;
      emitStatus("error", error?.message || "セッション復元エラー");
      throw cloudError(error, "クラウドセッションを復元できませんでした。");
    }
  }

  async function changePin(currentPin, nextPin) {
    await loadSdk();
    if (!auth.currentUser || !signedAccount) {
      throw new Error("再度ログインしてください。");
    }
    try {
      const email = await loginEmail(signedAccount.loginId);
      const credential = authApi.EmailAuthProvider.credential(
        email,
        await pinPassword(signedAccount.loginId, currentPin)
      );
      await authApi.reauthenticateWithCredential(auth.currentUser, credential);
      await authApi.updatePassword(
        auth.currentUser,
        await pinPassword(signedAccount.loginId, nextPin)
      );
      await firestoreApi.updateDoc(accountRef(auth.currentUser.uid), {
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      throw cloudError(error, "PINを変更できませんでした。");
    }
  }

  async function listAccounts() {
    await loadSdk();
    if (signedAccount?.role !== "management") {
      throw new Error("Managementだけがアカウントを確認できます。");
    }
    const query = firestoreApi.query(
      firestoreApi.collection(db, ACCOUNT_COLLECTION),
      firestoreApi.where("organizationId", "==", organizationId)
    );
    const snapshot = await firestoreApi.getDocs(query);
    return snapshot.docs.map(document => Object.assign(
      { id: document.id },
      document.data()
    )).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ja"));
  }

  async function provisionAccount(values) {
    await loadSdk();
    if (signedAccount?.role !== "management") {
      throw new Error("Managementだけがアカウントを作成できます。");
    }
    const role = String(values?.role || "");
    const memberId = String(values?.memberId || "");
    const loginId = validateLoginId(values?.loginId);
    const pin = validatePin(values?.pin);
    if (!["staff", "support", "management"].includes(role) || !memberId) {
      throw new Error("Growth OSの人物と役割を確認してください。");
    }
    const organization = window.GrowthTeam?.getPayload?.()?.organization || {};
    const memberList = role === "staff"
      ? organization.staffMembers
      : role === "support"
        ? organization.supportMembers
        : organization.managementMembers;
    const member = (memberList || []).find(item =>
      item.id === memberId && item.status === "active"
    );
    if (!member) throw new Error("Growth OSの人物が見つかりません。");
    const existing = await listAccounts();
    if (existing.some(account => account.memberId === memberId && account.role === role)) {
      throw new Error("この人物にはすでに個人アカウントがあります。");
    }

    const secondaryName = `growth-provisioner-${Date.now()}`;
    const secondaryApp = appModule.initializeApp(config.firebase, secondaryName);
    const secondaryAuth = authApi.getAuth(secondaryApp);
    await authApi.setPersistence(secondaryAuth, authApi.inMemoryPersistence);
    let credential = null;
    try {
      credential = await authApi.createUserWithEmailAndPassword(
        secondaryAuth,
        await loginEmail(loginId),
        await pinPassword(loginId, pin)
      );
      const staffIds = role === "staff"
        ? [memberId]
        : role === "support"
          ? (member.staffIds || [])
          : (organization.staffMembers || []).map(item => item.id);
      await firestoreApi.setDoc(accountRef(credential.user.uid), {
        organizationId,
        memberId,
        role,
        loginId,
        displayName: member.name,
        staffIds,
        active: true,
        memberActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: signedAccount.memberId
      });
      return true;
    } catch (error) {
      if (credential?.user) {
        await authApi.deleteUser(credential.user).catch(() => {});
      }
      throw cloudError(error, "アカウントを作成できませんでした。");
    } finally {
      await authApi.signOut(secondaryAuth).catch(() => {});
      await appModule.deleteApp(secondaryApp).catch(() => {});
    }
  }

  async function setAccountStatus(accountId, active) {
    await loadSdk();
    if (signedAccount?.role !== "management") {
      throw new Error("Managementだけがアカウント状態を変更できます。");
    }
    if (accountId === auth.currentUser?.uid && active !== true) {
      throw new Error("ログイン中の自分自身は停止できません。");
    }
    try {
      await firestoreApi.updateDoc(accountRef(accountId), {
        active: active === true,
        updatedAt: new Date().toISOString(),
        updatedBy: signedAccount.memberId
      });
      return true;
    } catch (error) {
      throw cloudError(error, "アカウント状態を変更できませんでした。");
    }
  }

  async function logout() {
    queuedPayload = null;
    saveFailures = 0;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = null;
    signedAccount = null;
    if (configured) {
      await loadSdk();
      await authApi.signOut(auth);
    }
    emitStatus(configured ? "ready" : "local", "ログアウト");
  }

  function organizationForCloud(payload) {
    const organization = sanitize(payload.organization || {});
    delete organization.library;
    organization.schemaVersion = Number(payload.schemaVersion) || 10;
    organization.cloudRevision = Date.now();
    organization.updatedAt = new Date().toISOString();
    return organization;
  }

  function allowedSegments() {
    return ROLE_SEGMENTS[signedAccount?.role] || [];
  }

  function canWriteAsset(asset) {
    if (signedAccount?.role === "management") return true;
    const allowedStaff = signedAccount?.role === "staff"
      ? [signedAccount.memberId]
      : signedAccount?.staffIds || [];
    const linked = Array.isArray(asset.staffIds) ? asset.staffIds : [];
    return linked.length > 0 && linked.some(id => allowedStaff.includes(id));
  }

  async function synchronizeAccounts(batch, organization) {
    if (signedAccount?.role !== "management") return;
    const accounts = await listAccounts();
    const members = [
      ...(organization.staffMembers || []),
      ...(organization.supportMembers || []),
      ...(organization.managementMembers || [])
    ];
    accounts.forEach(account => {
      const member = members.find(item =>
        item.id === account.memberId && item.role === account.role
      );
      if (!member) return;
      const staffIds = account.role === "staff"
        ? [member.id]
        : account.role === "support"
          ? (member.staffIds || [])
          : (organization.staffMembers || []).map(item => item.id);
      batch.set(accountRef(account.id), {
        displayName: member.name,
        staffIds,
        memberActive: member.status === "active",
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });
  }

  async function performSave() {
    if (!queuedPayload || !auth?.currentUser || !signedAccount || saveInFlight) return;
    const payload = queuedPayload;
    queuedPayload = null;
    saveInFlight = true;
    emitStatus("saving", "クラウドへ保存中");
    try {
      const batch = firestoreApi.writeBatch(db);
      const organization = organizationForCloud(payload);
      if (signedAccount.role === "management") {
        assertDocumentSize(organization, "組織情報");
        batch.set(organizationRef(), organization, { merge: true });
      }
      const permittedStaffIds = visibleStaffIds(payload.organization, signedAccount);
      const segmentIds = allowedSegments();
      for (const staffId of permittedStaffIds) {
        const workspace = payload.staffWorkspaces?.[staffId];
        if (!workspace) continue;
        const segments = splitWorkspace(workspace);
        segmentIds.forEach(segmentId => {
          const segment = Object.assign({}, segments[segmentId], {
            staffId,
            segmentId,
            organizationId,
            updatedAt: new Date().toISOString(),
            updatedBy: signedAccount.memberId,
            updatedByRole: signedAccount.role
          });
          assertDocumentSize(segment, `${staffId}の${segmentId}`);
          batch.set(staffSegmentRef(staffId, segmentId), segment, { merge: true });
        });
      }
      for (const asset of payload.organization?.library || []) {
        if (!asset?.id || !canWriteAsset(asset)) continue;
        const document = Object.assign({}, sanitize(asset), {
          organizationId,
          updatedAt: new Date().toISOString(),
          updatedById: signedAccount.memberId,
          updatedByRole: signedAccount.role
        });
        assertDocumentSize(document, `Library「${asset.title || asset.id}」`);
        batch.set(
          firestoreApi.doc(libraryCollectionRef(), asset.id),
          document,
          { merge: true }
        );
      }
      if (signedAccount.role === "management") {
        const retainedAssetIds = new Set(
          (payload.organization?.library || [])
            .map(asset => String(asset?.id || ""))
            .filter(Boolean)
        );
        const currentLibrary = await firestoreApi.getDocs(libraryCollectionRef());
        currentLibrary.docs.forEach(snapshot => {
          if (!retainedAssetIds.has(snapshot.id)) batch.delete(snapshot.ref);
        });
      }
      await synchronizeAccounts(batch, payload.organization || {});
      await batch.commit();
      cloudRevision = organization.cloudRevision || Date.now();
      saveFailures = 0;
      clearPendingSave();
      emitStatus("synced", "クラウド同期済み");
    } catch (error) {
      queuedPayload = payload;
      persistPendingSave(payload);
      saveFailures += 1;
      emitStatus("error", error?.message || "クラウド保存エラー");
      if (saveFailures <= 5) {
        scheduleSave(
          queuedPayload,
          Math.min(30000, 1000 * (2 ** saveFailures))
        );
      }
      throw cloudError(error, "クラウドへ保存できませんでした。");
    } finally {
      saveInFlight = false;
    }
  }

  function scheduleSave(payload, delay = 900) {
    if (!configured || !auth?.currentUser || !signedAccount || !payload) return false;
    queuedPayload = payload;
    persistPendingSave(payload);
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      performSave().catch(() => {});
    }, delay);
    return true;
  }

  async function flush() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = null;
    await performSave();
  }

  function account() {
    return signedAccount ? { ...signedAccount } : null;
  }

  const ready = configured
    ? loadSdk().catch(error => {
      emitStatus("error", error?.message || "クラウド初期化エラー");
      return false;
    })
    : Promise.resolve(false);

  window.GrowthCloud = Object.freeze({
    isConfigured: configured,
    ready,
    login,
    restore,
    logout,
    changePin,
    listAccounts,
    provisionAccount,
    setAccountStatus,
    loadState,
    scheduleSave,
    flush,
    account,
    getRevision: () => cloudRevision
  });
  emitStatus(configured ? "connecting" : "local", configured ? "接続準備中" : "端末内モード");
})();
