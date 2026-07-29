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
  const sdkVersion = String(config.sdkVersion || "12.16.0");
  const region = String(config.region || "asia-northeast1");
  let auth = null;
  let functions = null;
  let authApi = null;
  let functionsApi = null;
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
    return `${config.organizationId}:${account.role}:${account.memberId}`;
  }

  function persistPendingSave(payload) {
    const key = accountSaveKey();
    if (!key || !payload) return;
    try {
      const pending = readPendingSaves();
      pending[key] = {
        payload,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(pending));
    } catch (_) {
      // The canonical local Growth OS snapshot is still retained by team-v70.
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

  function callableError(error, fallback) {
    const code = String(error?.code || "");
    if (code.includes("resource-exhausted")) {
      return new Error("試行回数が多いため、しばらく待ってから再度お試しください。");
    }
    if (code.includes("permission-denied") || code.includes("unauthenticated")) {
      return new Error("個人IDまたはPINが違います。");
    }
    if (code.includes("failed-precondition")) {
      return new Error(error?.message || "クラウドの初期設定が完了していません。");
    }
    if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
      return new Error("クラウドへ接続できません。通信状態を確認してください。");
    }
    return new Error(error?.message || fallback);
  }

  async function loadSdk() {
    if (!configured || initialized) return configured;
    emitStatus("connecting", "Firebaseへ接続中");
    const base = `https://www.gstatic.com/firebasejs/${sdkVersion}`;
    const [appModule, authModule, functionsModule] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-functions.js`)
    ]);
    const app = appModule.initializeApp(config.firebase);
    authApi = authModule;
    functionsApi = functionsModule;
    auth = authModule.getAuth(app);
    functions = functionsModule.getFunctions(app, region);
    initialized = true;
    emitStatus("ready", "クラウド接続済み");
    return true;
  }

  function call(name, data) {
    if (!functionsApi || !functions) throw new Error("クラウドへ接続できていません。");
    return functionsApi.httpsCallable(functions, name)(data || {});
  }

  async function loadState() {
    await loadSdk();
    if (!auth?.currentUser) return null;
    try {
      const response = await call("loadGrowthState", {
        organizationId: config.organizationId
      });
      const result = response?.data || {};
      cloudRevision = Number(result.revision) || 0;
      if (result.payload) {
        window.GrowthTeam?.replacePayload?.(result.payload, {
          source: "cloud",
          revision: cloudRevision
        });
        window.dispatchEvent(new CustomEvent(CLOUD_PAYLOAD_EVENT, {
          detail: { revision: cloudRevision }
        }));
      }
      return result;
    } catch (error) {
      emitStatus("error", error?.message || "クラウド読込エラー");
      throw callableError(error, "クラウドデータを読み込めませんでした。");
    }
  }

  async function login(loginId, pin) {
    await loadSdk();
    try {
      emitStatus("connecting", "認証中");
      const response = await call("pinLogin", {
        organizationId: config.organizationId,
        loginId: normalizeLoginId(loginId),
        pin: String(pin || "")
      });
      const result = response?.data || {};
      if (!result.token || !result.account) {
        throw new Error("認証結果が正しくありません。");
      }
      await authApi.signInWithCustomToken(auth, result.token);
      signedAccount = result.account;
      const state = await loadState();
      restorePendingSave();
      emitStatus("synced", "クラウド同期済み");
      return { account: signedAccount, payload: state?.payload || null };
    } catch (error) {
      await authApi?.signOut?.(auth).catch(() => {});
      signedAccount = null;
      emitStatus("error", "ログインできませんでした");
      throw callableError(error, "ログインできませんでした。");
    }
  }

  async function restore() {
    if (!configured) return null;
    await loadSdk();
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    try {
      const token = await auth.currentUser.getIdTokenResult(true);
      signedAccount = {
        id: `cloud-${token.claims.role}-${token.claims.memberId}`,
        memberId: String(token.claims.memberId || ""),
        role: String(token.claims.role || ""),
        loginId: String(token.claims.loginId || ""),
        organizationId: String(token.claims.organizationId || config.organizationId),
        cloud: true
      };
      if (!signedAccount.memberId || !["staff", "support", "management"].includes(signedAccount.role)) {
        await authApi.signOut(auth);
        return null;
      }
      const state = await loadState();
      restorePendingSave();
      emitStatus("synced", "クラウド同期済み");
      return { account: signedAccount, payload: state?.payload || null };
    } catch (error) {
      emitStatus("error", error?.message || "セッション復元エラー");
      throw callableError(error, "クラウドセッションを復元できませんでした。");
    }
  }

  async function changePin(currentPin, nextPin) {
    await loadSdk();
    if (!auth.currentUser) throw new Error("再度ログインしてください。");
    try {
      await call("changeGrowthPin", {
        organizationId: config.organizationId,
        currentPin: String(currentPin || ""),
        nextPin: String(nextPin || "")
      });
      return true;
    } catch (error) {
      throw callableError(error, "PINを変更できませんでした。");
    }
  }

  async function listAccounts() {
    await loadSdk();
    const response = await call("listGrowthAccounts", {
      organizationId: config.organizationId
    });
    return Array.isArray(response?.data?.accounts) ? response.data.accounts : [];
  }

  async function provisionAccount(values) {
    await loadSdk();
    try {
      await call("provisionGrowthAccount", Object.assign({
        organizationId: config.organizationId
      }, values || {}));
      return true;
    } catch (error) {
      throw callableError(error, "アカウントを作成できませんでした。");
    }
  }

  async function setAccountStatus(accountId, active) {
    await loadSdk();
    try {
      await call("setGrowthAccountStatus", {
        organizationId: config.organizationId,
        accountId,
        active: active === true
      });
      return true;
    } catch (error) {
      throw callableError(error, "アカウント状態を変更できませんでした。");
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

  async function performSave() {
    if (!queuedPayload || !auth?.currentUser || saveInFlight) return;
    const payload = queuedPayload;
    queuedPayload = null;
    saveInFlight = true;
    emitStatus("saving", "クラウドへ保存中");
    try {
      const response = await call("saveGrowthState", {
        organizationId: config.organizationId,
        payload,
        clientRevision: cloudRevision
      });
      cloudRevision = Number(response?.data?.revision) || cloudRevision;
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
      throw callableError(error, "クラウドへ保存できませんでした。");
    } finally {
      saveInFlight = false;
    }
  }

  function scheduleSave(payload, delay = 900) {
    if (!configured || !auth?.currentUser || !payload) return false;
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
