(() => {
  "use strict";
  if (window.__growthAccountAuthV77) return;
  window.__growthAccountAuthV77 = true;

  const THEME_KEY = "growthOS.ui.theme.v77";
  const ACCOUNTS_KEY = "growthOS.auth.accounts.v77";
  const SESSION_KEY = "growthOS.auth.session.v77";
  const AUTH_VERSION = 1;
  const ROLE_LABELS = {
    staff: "Staff",
    support: "Support",
    management: "Management"
  };

  const html = document.documentElement;
  let gateMode = "login";
  let currentAccount = null;
  let applyingAccount = false;
  let chromeRefreshQueued = false;

  function safe(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function safeAttribute(value = "") {
    return safe(value).replace(/`/g, "&#096;");
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeLoginId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function readTheme() {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, persist = true) {
    const next = theme === "dark" ? "dark" : "light";
    html.dataset.theme = next;
    if (persist) localStorage.setItem(THEME_KEY, next);
    document.querySelectorAll("[data-auth77-theme]").forEach(button => {
      const active = button.dataset.auth77Theme === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = next === "dark" ? "#191919" : "#f5f7f7";
  }

  function accounts() {
    const stored = readJson(ACCOUNTS_KEY, []);
    return Array.isArray(stored) ? stored : [];
  }

  function saveAccounts(list) {
    writeJson(ACCOUNTS_KEY, list);
  }

  function payload() {
    return window.GrowthTeam?.getPayload?.() || null;
  }

  function allMembers() {
    const organization = payload()?.organization;
    if (!organization) return [];
    return [
      ...(organization.staffMembers || []),
      ...(organization.supportMembers || []),
      ...(organization.managementMembers || [])
    ].filter(member => member?.status === "active");
  }

  function memberFor(account) {
    if (!account) return null;
    return allMembers().find(member => (
      member.id === account.memberId && member.role === account.role
    )) || null;
  }

  function availableMembers() {
    const registered = new Set(accounts().map(account => `${account.role}:${account.memberId}`));
    return allMembers().filter(member => !registered.has(`${member.role}:${member.id}`));
  }

  function randomSalt() {
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  function fallbackHash(text) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
  }

  async function hashPin(pin, salt) {
    const input = `${salt}:${pin}`;
    if (window.crypto?.subtle && window.TextEncoder) {
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input)
      );
      return [...new Uint8Array(digest)]
        .map(value => value.toString(16).padStart(2, "0"))
        .join("");
    }
    return fallbackHash(input);
  }

  function accountIdFor(member) {
    return `account-${member.role}-${member.id}`;
  }

  function session() {
    return readJson(SESSION_KEY, null);
  }

  function saveSession(account) {
    writeJson(SESSION_KEY, {
      version: AUTH_VERSION,
      accountId: account.id,
      memberId: account.memberId,
      role: account.role,
      issuedAt: new Date().toISOString()
    });
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function accountFromSession() {
    const saved = session();
    if (!saved) return null;
    const account = accounts().find(item => (
      item.id === saved.accountId &&
      item.memberId === saved.memberId &&
      item.role === saved.role
    ));
    return memberFor(account) ? account : null;
  }

  function setAppLocked(locked) {
    document.body.classList.toggle("auth77-locked", locked);
    document.body.classList.toggle("auth77-ready", !locked);
    for (const selector of [".top", ".shell", ".bottom"]) {
      const node = document.querySelector(selector);
      if (!node) continue;
      node.inert = locked;
      node.setAttribute("aria-hidden", String(locked));
    }
    const gate = document.getElementById("auth77Gate");
    if (gate) gate.hidden = !locked;
  }

  function avatarMarkup(member, className = "auth77-avatar") {
    const initial = safe(member?.initial || member?.name?.slice(0, 1) || "G");
    const image = String(member?.avatar || "").trim();
    return `<span class="${className}">${image
      ? `<img src="${safeAttribute(image)}" alt="">`
      : initial}</span>`;
  }

  function gateMarkup() {
    return `
      <div class="auth77-gate" id="auth77Gate">
        <div class="auth77-shell">
          <section class="auth77-story">
            <div>
              <div class="auth77-logo"><span>Growth</span></div>
            </div>
            <small class="lead">Growth OS v7.9</small>
          </section>
          <section class="auth77-formpanel">
            <div class="auth77-formwrap">
              <h2 id="auth77Title">ログイン</h2>
              <p id="auth77Description">個人IDと4桁のPINを入力してください。</p>
              <form id="auth77Form" novalidate>
                <div id="auth77LoginFields">
                  <label class="auth77-field">
                    <span>個人ID</span>
                    <input id="auth77LoginId" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="例：kurosaka">
                  </label>
                  <label class="auth77-field">
                    <span>4桁PIN</span>
                    <input class="auth77-pin" id="auth77LoginPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" placeholder="••••">
                  </label>
                </div>
                <div id="auth77SetupFields" hidden>
                  <label class="auth77-field">
                    <span>登録する人物</span>
                    <select id="auth77Member"></select>
                  </label>
                  <label class="auth77-field">
                    <span>個人ID</span>
                    <input id="auth77NewLoginId" autocapitalize="none" spellcheck="false" placeholder="半角英数字・._-">
                  </label>
                  <label class="auth77-field">
                    <span>4桁PIN</span>
                    <input class="auth77-pin" id="auth77NewPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" placeholder="••••">
                  </label>
                  <label class="auth77-field">
                    <span>4桁PINを再入力</span>
                    <input class="auth77-pin" id="auth77ConfirmPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" placeholder="••••">
                  </label>
                </div>
                <button class="auth77-submit" id="auth77Submit" type="submit">ログイン</button>
                <p class="auth77-message" id="auth77Message" role="alert"></p>
              </form>
              <div class="auth77-formfoot">
                <button class="auth77-link" id="auth77Mode" type="button">初回設定はこちら</button>
                <div class="auth77-theme-switch" aria-label="表示テーマ">
                  <button type="button" data-auth77-theme="light">☀ ライト</button>
                  <button type="button" data-auth77-theme="dark">☾ ダーク</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function ensureGate() {
    if (!document.getElementById("auth77Gate")) {
      document.body.insertAdjacentHTML("beforeend", gateMarkup());
    }
    bindPinInputs(document.getElementById("auth77Gate"));
    renderGateMode(accounts().length ? "login" : "setup");
  }

  function bindPinInputs(root) {
    root?.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
      if (input.dataset.auth77Bound) return;
      input.dataset.auth77Bound = "true";
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 4);
      });
    });
  }

  function memberOptions() {
    return availableMembers().map(member => (
      `<option value="${safeAttribute(`${member.role}:${member.id}`)}">${safe(member.name)} — ${safe(ROLE_LABELS[member.role])}</option>`
    )).join("");
  }

  function setGateMessage(message, tone = "error") {
    const node = document.getElementById("auth77Message");
    if (!node) return;
    node.textContent = message || "";
    node.style.color = tone === "success" ? "var(--green)" : "var(--red)";
  }

  function renderGateMode(mode) {
    const canSetup = availableMembers().length > 0;
    gateMode = mode === "setup" && canSetup ? "setup" : "login";
    const setup = gateMode === "setup";
    const loginFields = document.getElementById("auth77LoginFields");
    const setupFields = document.getElementById("auth77SetupFields");
    if (!loginFields || !setupFields) return;
    loginFields.hidden = setup;
    setupFields.hidden = !setup;
    document.getElementById("auth77Title").textContent = setup ? "初回アカウント設定" : "ログイン";
    document.getElementById("auth77Description").textContent = setup
      ? "Growth OSの人物データへ、この端末の個人IDと4桁PINを結びます。"
      : "個人IDと4桁のPINを入力してください。";
    document.getElementById("auth77Submit").textContent = setup ? "アカウントを設定" : "ログイン";
    const modeButton = document.getElementById("auth77Mode");
    modeButton.hidden = !canSetup && !setup;
    modeButton.textContent = setup ? "ログインへ戻る" : "初回設定はこちら";
    document.getElementById("auth77Member").innerHTML = memberOptions();
    setGateMessage("");
    setTimeout(() => {
      document.getElementById(setup ? "auth77NewLoginId" : "auth77LoginId")?.focus();
    }, 0);
  }

  async function registerAccount() {
    const value = document.getElementById("auth77Member").value;
    const [role, ...memberParts] = value.split(":");
    const memberId = memberParts.join(":");
    const member = allMembers().find(item => item.role === role && item.id === memberId);
    const loginId = normalizeLoginId(document.getElementById("auth77NewLoginId").value);
    const pin = document.getElementById("auth77NewPin").value;
    const confirmPin = document.getElementById("auth77ConfirmPin").value;
    if (!member) throw new Error("登録する人物を選択してください。");
    if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) {
      throw new Error("個人IDは3〜32文字の半角英数字・._-で入力してください。");
    }
    if (!/^\d{4}$/.test(pin)) throw new Error("PINは4桁の数字で入力してください。");
    if (pin !== confirmPin) throw new Error("2つのPINが一致していません。");
    const list = accounts();
    if (list.some(account => normalizeLoginId(account.loginId) === loginId)) {
      throw new Error("その個人IDはすでに使われています。");
    }
    if (list.some(account => account.memberId === member.id && account.role === member.role)) {
      throw new Error("この人物にはすでにアカウントがあります。");
    }
    const salt = randomSalt();
    const account = {
      id: accountIdFor(member),
      version: AUTH_VERSION,
      memberId: member.id,
      role: member.role,
      loginId,
      salt,
      pinHash: await hashPin(pin, salt),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(account);
    saveAccounts(list);
    saveSession(account);
    setGateMessage("アカウントを設定しました。", "success");
    await activate(account);
  }

  async function login() {
    const loginId = normalizeLoginId(document.getElementById("auth77LoginId").value);
    const pin = document.getElementById("auth77LoginPin").value;
    if (!loginId || !/^\d{4}$/.test(pin)) {
      throw new Error("個人IDと4桁のPINを確認してください。");
    }
    const account = accounts().find(item => normalizeLoginId(item.loginId) === loginId);
    if (!account || !memberFor(account)) {
      throw new Error("個人IDまたはPINが違います。");
    }
    const pinHash = await hashPin(pin, account.salt);
    if (pinHash !== account.pinHash) throw new Error("個人IDまたはPINが違います。");
    saveSession(account);
    await activate(account);
  }

  async function activate(account) {
    const member = memberFor(account);
    if (!member) throw new Error("このアカウントに対応する人物が見つかりません。");
    applyingAccount = true;
    const context = window.GrowthTeam?.activateAccount?.(account.role, account.memberId);
    applyingAccount = false;
    if (!context) throw new Error("このアカウントのGrowth OSを開けませんでした。");
    currentAccount = account;
    setAppLocked(false);
    ensureAccountChrome();
    queueChromeRefresh();
    document.getElementById("auth77LoginPin").value = "";
    document.getElementById("auth77NewPin").value = "";
    document.getElementById("auth77ConfirmPin").value = "";
  }

  function accountButtonMarkup(account, member) {
    return `
      <button class="auth77-account-button" id="auth77AccountButton" type="button" aria-haspopup="menu" aria-expanded="false">
        ${avatarMarkup(member)}
        <span class="auth77-account-copy">
          <b>${safe(member.name)}</b>
          <small>${safe(ROLE_LABELS[account.role])}</small>
        </span>
        <span class="auth77-chevron">⌄</span>
      </button>
      <div class="auth77-menu" id="auth77Menu" role="menu" hidden>
        <div class="auth77-menu-head">
          ${avatarMarkup(member)}
          <span><b>${safe(member.name)}</b><small>${safe(account.loginId)} · ${safe(ROLE_LABELS[account.role])}</small></span>
        </div>
        <div class="auth77-menu-row">
          <span>表示テーマ</span>
          <div class="auth77-theme-switch" aria-label="表示テーマ">
            <button type="button" data-auth77-theme="light">☀ ライト</button>
            <button type="button" data-auth77-theme="dark">☾ ダーク</button>
          </div>
        </div>
        <button class="auth77-menu-action" type="button" data-auth77-action="change-pin">PINを変更</button>
        <button class="auth77-menu-action logout" type="button" data-auth77-action="logout">ログアウト</button>
      </div>
    `;
  }

  function ensureAccountChrome() {
    if (!currentAccount) return;
    const member = memberFor(currentAccount);
    const top = document.querySelector(".top");
    if (!member || !top) return;
    let root = document.getElementById("auth77Account");
    if (!root) {
      root = document.createElement("div");
      root.id = "auth77Account";
      root.className = "auth77-account";
      top.appendChild(root);
    }
    const identityKey = `${currentAccount.id}:${member.updatedAt || ""}`;
    if (root.dataset.identity !== identityKey) {
      root.dataset.identity = identityKey;
      root.innerHTML = accountButtonMarkup(currentAccount, member);
    }
    applyTheme(readTheme(), false);
    enforceAccountContext();
  }

  function enforceAccountContext() {
    if (!currentAccount) return;
    document.body.dataset.accountRole = currentAccount.role;
    document.body.dataset.accountId = currentAccount.id;
    document.querySelectorAll(".role[data-role]").forEach(button => {
      const allowed = button.dataset.role === currentAccount.role;
      button.disabled = !allowed;
      button.setAttribute("aria-hidden", String(!allowed));
    });
    const actorSelect = document.getElementById("v7ActorSelect");
    if (actorSelect) {
      actorSelect.value = currentAccount.memberId;
      actorSelect.disabled = true;
      actorSelect.setAttribute("aria-label", "ログイン中の人物");
    }
    const personBar = document.querySelector(".v7-personbar");
    personBar?.classList.toggle("auth77-staff", currentAccount.role === "staff");
  }

  function queueChromeRefresh() {
    if (chromeRefreshQueued) return;
    chromeRefreshQueued = true;
    requestAnimationFrame(() => {
      chromeRefreshQueued = false;
      ensureAccountChrome();
    });
  }

  function toggleAccountMenu(force) {
    const menu = document.getElementById("auth77Menu");
    const button = document.getElementById("auth77AccountButton");
    if (!menu || !button) return;
    const open = typeof force === "boolean" ? force : menu.hidden;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function pinDialogMarkup() {
    return `
      <div class="auth77-dialog" id="auth77PinDialog" hidden>
        <form class="auth77-dialog-card" id="auth77PinForm">
          <h2>4桁PINを変更</h2>
          <p>現在のPINを確認してから、新しい4桁PINへ更新します。</p>
          <label class="auth77-field"><span>現在のPIN</span><input class="auth77-pin" id="auth77CurrentPin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password"></label>
          <label class="auth77-field"><span>新しいPIN</span><input class="auth77-pin" id="auth77ChangedPin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
          <label class="auth77-field"><span>新しいPINを再入力</span><input class="auth77-pin" id="auth77ChangedPinConfirm" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
          <p class="auth77-message" id="auth77PinMessage" role="alert"></p>
          <div class="auth77-dialog-actions">
            <button class="cancel" type="button" data-auth77-action="close-pin">キャンセル</button>
            <button class="confirm" type="submit">PINを更新</button>
          </div>
        </form>
      </div>
    `;
  }

  function openPinDialog() {
    if (!document.getElementById("auth77PinDialog")) {
      document.body.insertAdjacentHTML("beforeend", pinDialogMarkup());
      bindPinInputs(document.getElementById("auth77PinDialog"));
    }
    const dialog = document.getElementById("auth77PinDialog");
    dialog.hidden = false;
    document.getElementById("auth77PinMessage").textContent = "";
    document.getElementById("auth77CurrentPin").value = "";
    document.getElementById("auth77ChangedPin").value = "";
    document.getElementById("auth77ChangedPinConfirm").value = "";
    document.getElementById("auth77CurrentPin").focus();
  }

  function closePinDialog() {
    const dialog = document.getElementById("auth77PinDialog");
    if (dialog) dialog.hidden = true;
  }

  async function changePin() {
    if (!currentAccount) throw new Error("ログイン情報が見つかりません。");
    const currentPin = document.getElementById("auth77CurrentPin").value;
    const changedPin = document.getElementById("auth77ChangedPin").value;
    const confirmation = document.getElementById("auth77ChangedPinConfirm").value;
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(changedPin)) {
      throw new Error("PINは4桁の数字で入力してください。");
    }
    if (changedPin !== confirmation) throw new Error("新しいPINが一致していません。");
    const list = accounts();
    const account = list.find(item => item.id === currentAccount.id);
    if (!account) throw new Error("ログイン情報が見つかりません。");
    if (await hashPin(currentPin, account.salt) !== account.pinHash) {
      throw new Error("現在のPINが違います。");
    }
    const salt = randomSalt();
    account.salt = salt;
    account.pinHash = await hashPin(changedPin, salt);
    account.updatedAt = new Date().toISOString();
    saveAccounts(list);
    currentAccount = account;
    closePinDialog();
    toggleAccountMenu(false);
  }

  function logout() {
    clearSession();
    currentAccount = null;
    document.getElementById("auth77Account")?.remove();
    setAppLocked(true);
    renderGateMode("login");
    toggleAccountMenu(false);
  }

  function handleRoleCapture(event) {
    if (!currentAccount || applyingAccount) return;
    const roleButton = event.target.closest?.(".role[data-role]");
    if (roleButton && roleButton.dataset.role !== currentAccount.role) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const actorSelect = event.target.closest?.("#v7ActorSelect");
    if (actorSelect && actorSelect.value !== currentAccount.memberId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      actorSelect.value = currentAccount.memberId;
    }
  }

  document.addEventListener("click", handleRoleCapture, true);
  document.addEventListener("change", handleRoleCapture, true);

  document.addEventListener("click", event => {
    const themeButton = event.target.closest("[data-auth77-theme]");
    if (themeButton) {
      applyTheme(themeButton.dataset.auth77Theme);
      return;
    }
    if (event.target.closest("#auth77Mode")) {
      renderGateMode(gateMode === "login" ? "setup" : "login");
      return;
    }
    if (event.target.closest("#auth77AccountButton")) {
      toggleAccountMenu();
      return;
    }
    const action = event.target.closest("[data-auth77-action]")?.dataset.auth77Action;
    if (action === "logout") logout();
    if (action === "change-pin") {
      toggleAccountMenu(false);
      openPinDialog();
    }
    if (action === "close-pin") closePinDialog();
    if (!event.target.closest("#auth77Account") && !event.target.closest("#auth77PinDialog")) {
      toggleAccountMenu(false);
    }
  });

  document.addEventListener("submit", async event => {
    if (event.target.id === "auth77Form") {
      event.preventDefault();
      const submit = document.getElementById("auth77Submit");
      submit.disabled = true;
      submit.textContent = gateMode === "setup" ? "設定中…" : "確認中…";
      try {
        if (gateMode === "setup") await registerAccount();
        else await login();
      } catch (error) {
        setGateMessage(error?.message || "ログインできませんでした。");
      } finally {
        submit.disabled = false;
        submit.textContent = gateMode === "setup" ? "アカウントを設定" : "ログイン";
      }
    }
    if (event.target.id === "auth77PinForm") {
      event.preventDefault();
      const message = document.getElementById("auth77PinMessage");
      try {
        await changePin();
      } catch (error) {
        message.textContent = error?.message || "PINを変更できませんでした。";
      }
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    toggleAccountMenu(false);
    closePinDialog();
  });

  const observer = new MutationObserver(queueChromeRefresh);
  observer.observe(document.body, { childList: true, subtree: true });

  applyTheme(readTheme(), false);
  ensureGate();
  const restoredAccount = accountFromSession();
  if (restoredAccount) {
    activate(restoredAccount).catch(() => {
      clearSession();
      currentAccount = null;
      setAppLocked(true);
      renderGateMode("login");
    }).finally(() => {
      html.dataset.authState = "ready";
    });
  } else {
    setAppLocked(true);
    html.dataset.authState = "ready";
  }
})();
