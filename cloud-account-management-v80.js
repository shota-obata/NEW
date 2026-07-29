(() => {
  "use strict";
  if (window.__growthCloudAccountsV80) return;
  window.__growthCloudAccountsV80 = true;

  let accounts = [];
  let loading = false;
  let loadedOnce = false;

  function safe(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function payload() {
    return window.GrowthTeam?.getPayload?.() || null;
  }

  function members() {
    const organization = payload()?.organization;
    if (!organization) return [];
    return [
      ...(organization.staffMembers || []),
      ...(organization.supportMembers || []),
      ...(organization.managementMembers || [])
    ].filter(member => member.status === "active");
  }

  function roleLabel(role) {
    return role === "staff" ? "Staff" : role === "support" ? "Support" : "Management";
  }

  function memberOptions() {
    const assigned = new Set(accounts.map(account => `${account.role}:${account.memberId}`));
    return members()
      .filter(member => !assigned.has(`${member.role}:${member.id}`))
      .map(member => (
        `<option value="${safe(`${member.role}:${member.id}`)}">${safe(member.name)} — ${safe(roleLabel(member.role))}</option>`
      )).join("");
  }

  function sectionMarkup() {
    return `
      <section class="card cloud80-accounts" id="cloud80Accounts">
        <div class="cloud80-head">
          <div>
            <div class="title">CLOUD ACCOUNTS</div>
            <h2>個人アカウント</h2>
            <p class="cloud80-note">人物・役割・個人IDを一対一で接続します。PINそのものは表示・保存しません。</p>
          </div>
          <button class="btn secondary small" type="button" data-cloud80-action="reload">再読込</button>
        </div>
        <form class="cloud80-form" id="cloud80AccountForm">
          <label><span>Growth OSの人物</span><select id="cloud80Member">${memberOptions()}</select></label>
          <label><span>個人ID</span><input id="cloud80LoginId" autocomplete="off" placeholder="例：kurosaka"></label>
          <label><span>初期4桁PIN</span><input id="cloud80Pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••"></label>
          <button class="btn primary" type="submit">作成</button>
        </form>
        <div class="cloud80-list">${accountsMarkup()}</div>
        <p class="cloud80-message" id="cloud80Message"></p>
      </section>
    `;
  }

  function accountsMarkup() {
    if (loading) return '<p class="cloud80-note">クラウドから確認しています…</p>';
    if (!accounts.length) return '<p class="cloud80-note">個人アカウントはまだありません。</p>';
    return accounts.map(account => `
      <div class="cloud80-account">
        <div class="cloud80-account-main">
          <b>${safe(account.displayName || account.loginId)}</b>
          <small>${safe(account.loginId)} · ${safe(roleLabel(account.role))}</small>
        </div>
        <span class="cloud80-status ${account.active ? "active" : ""}">${account.active ? "利用中" : "停止中"}</span>
        <button class="btn secondary small" type="button"
          data-cloud80-action="status"
          data-account-id="${safe(account.id)}"
          data-next-active="${account.active ? "false" : "true"}">${account.active ? "停止" : "再開"}</button>
      </div>
    `).join("");
  }

  function message(text, error = false) {
    const node = document.getElementById("cloud80Message");
    if (!node) return;
    node.textContent = text || "";
    node.style.color = error ? "var(--red)" : "var(--green)";
  }

  function render() {
    if (!window.GrowthCloud?.isConfigured) return;
    if (document.body.dataset.accountRole !== "management") return;
    const page = document.getElementById("management");
    if (!page?.classList.contains("active") || document.getElementById("cloud80Accounts")) return;
    page.insertAdjacentHTML("beforeend", sectionMarkup());
  }

  async function loadAccounts() {
    if (!window.GrowthCloud?.isConfigured || document.body.dataset.accountRole !== "management") return;
    loading = true;
    loadedOnce = true;
    document.querySelector(".cloud80-list")?.replaceChildren();
    render();
    try {
      accounts = await window.GrowthCloud.listAccounts();
    } catch (error) {
      message(error?.message || "アカウントを確認できませんでした。", true);
    } finally {
      loading = false;
      const list = document.querySelector(".cloud80-list");
      if (list) list.innerHTML = accountsMarkup();
      const select = document.getElementById("cloud80Member");
      if (select) select.innerHTML = memberOptions();
    }
  }

  document.addEventListener("submit", async event => {
    if (event.target.id !== "cloud80AccountForm") return;
    event.preventDefault();
    const [role, ...memberParts] = document.getElementById("cloud80Member").value.split(":");
    const memberId = memberParts.join(":");
    const loginId = document.getElementById("cloud80LoginId").value.trim().toLowerCase();
    const pin = document.getElementById("cloud80Pin").value;
    if (!memberId || !/^[a-z0-9._-]{3,32}$/.test(loginId) || !/^\d{4}$/.test(pin)) {
      message("人物・3文字以上の個人ID・4桁PINを確認してください。", true);
      return;
    }
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await window.GrowthCloud.provisionAccount({ role, memberId, loginId, pin });
      document.getElementById("cloud80LoginId").value = "";
      document.getElementById("cloud80Pin").value = "";
      message("個人アカウントを作成しました。");
      await loadAccounts();
    } catch (error) {
      message(error?.message || "アカウントを作成できませんでした。", true);
    } finally {
      submit.disabled = false;
    }
  });

  document.addEventListener("click", async event => {
    const action = event.target.closest("[data-cloud80-action]")?.dataset.cloud80Action;
    if (!action) return;
    if (action === "reload") {
      await loadAccounts();
      return;
    }
    if (action === "status") {
      const button = event.target.closest("[data-cloud80-action]");
      button.disabled = true;
      try {
        await window.GrowthCloud.setAccountStatus(
          button.dataset.accountId,
          button.dataset.nextActive === "true"
        );
        await loadAccounts();
      } catch (error) {
        message(error?.message || "アカウント状態を変更できませんでした。", true);
      } finally {
        button.disabled = false;
      }
    }
  });

  const observer = new MutationObserver(() => {
    render();
    if (document.getElementById("cloud80Accounts") && !loading && !loadedOnce) {
      loadAccounts();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  render();
})();
