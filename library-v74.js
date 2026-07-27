;(() => {
  "use strict";
  if (window.__growthLibraryV74 || !window.GrowthTeamCore) return;
  window.__growthLibraryV74 = true;

  const Core = window.GrowthTeamCore;
  const MODES = {
    "before-after": {
      label: "Before / After",
      description: "施術前と仕上がりを比較",
      roles: [["before", "Before"], ["after", "After"], ["detail", "Detail"]]
    },
    "reference-result": {
      label: "希望 / 仕上がり",
      description: "希望スタイルと実際の仕上がりを比較",
      roles: [["reference", "希望スタイル"], ["result", "仕上がり"], ["detail", "Detail"]]
    },
    "progress": {
      label: "過去 / 現在",
      description: "半年前などの過去と現在の成長を比較",
      roles: [["past", "過去"], ["current", "現在"], ["milestone", "途中経過"]]
    },
    free: {
      label: "自由比較",
      description: "角度・工程・詳細を自由に並べる",
      roles: [["image", "Image"], ["detail", "Detail"], ["reference", "Reference"]]
    }
  };
  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  const list = value => Array.isArray(value) ? value : [];
  const stamp = () => new Date().toLocaleString("ja-JP", { hour12: false });
  const isoNow = () => Core.isoNow ? Core.isoNow() : new Date().toISOString();
  let editingAssetId = "";
  let draftImages = [];
  let initialImageIds = [];

  function context() {
    const actor = window.GrowthTeam?.actorContext?.() || {};
    return {
      actorId: actor.actorId || "",
      actorName: actor.actorName || (
        state.role === "support" ? "Support" :
        state.role === "management" ? "Management" : "Staff"
      ),
      actorRole: actor.actorRole || state.role || "staff",
      staffId: actor.staffId || state.staffId || ""
    };
  }

  function normalizeAsset(asset, index) {
    return Core.normalizeAsset
      ? Core.normalizeAsset(asset, index)
      : Object.assign({ images: [], comparison: { mode: "free", title: "", note: "" } }, asset || {});
  }

  function ensureAssets() {
    state.library = list(state.library);
    let migrated = false;
    state.library = state.library.map((asset, index) => {
      if (!Array.isArray(asset.images) || !asset.comparison) migrated = true;
      return normalizeAsset(asset, index);
    });
    if (migrated) {
      try { save(); } catch (_) { /* The editor will surface quota errors on the next write. */ }
    }
  }

  function canEdit() {
    return state.role === "staff" || state.role === "support";
  }

  function modeInfo(mode) {
    return MODES[mode] || MODES.free;
  }

  function preferredImages(asset) {
    const images = list(asset.images);
    const roles = modeInfo(asset.comparison?.mode).roles.map(item => item[0]);
    const selected = [];
    for (const role of roles) {
      const image = images.find(item => item.role === role && !selected.includes(item));
      if (image) selected.push(image);
      if (selected.length === 2) break;
    }
    for (const image of images) {
      if (!selected.includes(image)) selected.push(image);
      if (selected.length === 2) break;
    }
    return selected;
  }

  function previewMarkup(asset) {
    const images = preferredImages(asset);
    if (!images.length) {
      return `<div class="v74-no-images"><span>＋</span><b>比較画像を追加</b><small>Before / After・希望 / 仕上がり・過去 / 現在</small></div>`;
    }
    return `
      <div class="v74-compare-preview ${images.length === 1 ? "single" : ""}">
        ${images.map(image => `
          <figure>
            <img src="${safe(image.src)}" alt="${safe(image.label || "")}">
            <figcaption><b>${safe(image.label || "Image")}</b>${image.capturedAt ? `<small>${safe(image.capturedAt)}</small>` : ""}</figcaption>
          </figure>
        `).join("")}
        ${list(asset.images).length > 2 ? `<i>＋${list(asset.images).length - 2}</i>` : ""}
      </div>
    `;
  }

  function assetSearchText(asset) {
    return [
      asset.title, asset.tag, asset.case, asset.decision, asset.correction,
      asset.rule, asset.next, asset.modelName, asset.comparison?.note,
      ...list(asset.images).flatMap(image => [image.label, image.note, image.capturedAt])
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function renderLibraryV74() {
    const root = document.getElementById("library");
    if (!root || state.page !== "library") return;
    ensureAssets();
    state.libraryUi = Object.assign({ query: "", filter: "all", view: "grid" }, state.libraryUi || {});
    const query = String(state.libraryUi.query || "").trim().toLowerCase();
    const filter = state.libraryUi.filter || "all";
    const assets = state.library.filter(asset => {
      const mode = asset.comparison?.mode || "free";
      return (!query || assetSearchText(asset).includes(query)) &&
        (filter === "all" || filter === mode || (filter === "visual" && list(asset.images).length));
    });
    const multiCount = state.library.filter(asset => list(asset.images).length >= 2).length;
    const progressCount = state.library.filter(asset => asset.comparison?.mode === "progress").length;
    const imageCount = state.library.reduce((sum, asset) => sum + list(asset.images).length, 0);
    const editor = canEdit();

    root.innerHTML = `
      <header class="v74-library-head">
        <div>
          <div class="eyebrow">VISUAL EXPERIENCE LIBRARY</div>
          <h1>変化を並べて、判断を資産にする。</h1>
          <p class="lead">一つのモデルをBefore / After、希望 / 仕上がり、過去 / 現在で比較し、次回使える判断へ変換します。</p>
        </div>
        ${editor ? `<button class="btn primary" data-v74-action="new-asset">＋ 比較資産を追加</button>` : ""}
      </header>

      <section class="v74-library-summary">
        <div><b>${state.library.length}</b><span>ASSETS</span><small>共有資産</small></div>
        <div><b>${imageCount}</b><span>IMAGES</span><small>比較画像</small></div>
        <div><b>${multiCount}</b><span>COMPARISONS</span><small>2枚以上</small></div>
        <div><b>${progressCount}</b><span>GROWTH SETS</span><small>過去 / 現在</small></div>
      </section>

      <div class="v74-library-toolbar">
        <label class="v74-library-search"><span>⌕</span><input id="v74LibrarySearch" value="${safe(state.libraryUi.query || "")}" placeholder="モデル・スタイル・判断・日付を検索"></label>
        <div class="v74-library-filters">
          ${[
            ["all", "すべて"],
            ["before-after", "Before / After"],
            ["reference-result", "希望 / 仕上がり"],
            ["progress", "過去 / 現在"],
            ["visual", "画像あり"]
          ].map(([id, label]) => `<button class="${filter === id ? "active" : ""}" data-v74-action="filter" data-filter="${id}">${label}</button>`).join("")}
        </div>
        <span>${assets.length} / ${state.library.length}</span>
      </div>

      <section class="v74-assets">
        ${assets.map(asset => {
          const mode = modeInfo(asset.comparison?.mode);
          const images = list(asset.images);
          const incomplete = images.length === 1;
          return `
            <article class="v74-asset ${incomplete ? "incomplete" : ""}">
              <button class="v74-card-open" data-v74-action="open-asset" data-id="${safe(asset.id)}" aria-label="${safe(asset.title)}を開く">
                ${previewMarkup(asset)}
              </button>
              <div class="v74-asset-body">
                <div class="v74-asset-tags"><span>${safe(mode.label)}</span>${asset.tag ? `<i>${safe(asset.tag)}</i>` : ""}${incomplete ? "<em>あと1枚</em>" : ""}</div>
                <h2>${safe(asset.title)}</h2>
                <p>${safe(asset.comparison?.note || asset.case || "比較から分かったことを記録してください。")}</p>
                <dl>
                  ${asset.modelName ? `<div><dt>MODEL</dt><dd>${safe(asset.modelName)}</dd></div>` : ""}
                  <div><dt>IMAGES</dt><dd>${images.length}枚</dd></div>
                  <div><dt>UPDATED</dt><dd>${safe(asset.updatedBy || "System")}・${safe(asset.updatedAt || "-")}</dd></div>
                </dl>
                <div class="v74-card-actions">
                  <button class="btn secondary small" data-v74-action="open-asset" data-id="${safe(asset.id)}">${editor ? "共同編集" : "比較を見る"}</button>
                  ${editor ? `<button class="btn secondary small" data-v74-action="open-images" data-id="${safe(asset.id)}">＋ 画像</button>` : ""}
                </div>
              </div>
            </article>
          `;
        }).join("") || `
          <div class="v74-library-empty">
            <span>◫</span><h2>条件に合う資産がありません。</h2><p>検索条件を変えるか、最初の比較資産を追加してください。</p>
          </div>
        `}
      </section>
    `;
  }

  function ensureModal() {
    if (document.getElementById("v74AssetModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="v74AssetModal" class="modal hidden">
        <div class="modalbox v74-asset-modal">
          <header class="v74-modal-head">
            <div><div class="eyebrow">VISUAL LIBRARY ASSET</div><h2 id="v74AssetHeading">比較資産を編集</h2><p>複数画像を並べ、変化と判断理由を一つの資産にします。</p></div>
            <button class="close" data-v74-action="close-asset">×</button>
          </header>
          <div class="v74-modal-layout">
            <main>
              <section class="v74-editor-section">
                <div class="v74-editor-title"><span>01</span><div><b>比較の設計</b><small>何と何を比較するか</small></div></div>
                <div class="v74-form-grid">
                  <label class="wide"><span>タイトル</span><input id="v74Title" placeholder="例：顔まわりレイヤー｜希望と仕上がり"></label>
                  <label><span>タグ</span><input id="v74Tag" placeholder="顔まわり / ボブ / 接客"></label>
                  <label><span>比較方法</span><select id="v74Mode">${Object.entries(MODES).map(([id, mode]) => `<option value="${id}">${safe(mode.label)}</option>`).join("")}</select></label>
                  <label class="wide"><span>比較から分かったこと</span><textarea id="v74ComparisonNote" placeholder="2枚以上を並べたことで見えた差・成長・判断の変化"></textarea></label>
                  <label><span>モデル予定と紐付け</span><select id="v74Model"></select></label>
                  <label><span>表示名</span><input id="v74ModelName" placeholder="モデル名 / Case名"></label>
                </div>
              </section>
              <section class="v74-editor-section">
                <div class="v74-editor-title"><span>02</span><div><b>比較画像</b><small>2枚以上・最大12枚</small></div><button class="btn primary small" data-v74-action="choose-images">＋ 画像を追加</button></div>
                <input id="v74ImageInput" type="file" accept="image/*" multiple class="hidden">
                <div id="v74DraftImages" class="v74-draft-images"></div>
              </section>
              <section class="v74-editor-section">
                <div class="v74-editor-title"><span>03</span><div><b>判断を再利用可能にする</b><small>Supportと共同編集</small></div></div>
                <div class="v74-form-grid">
                  <label class="wide"><span>Case｜何が起きたか</span><textarea id="v74Case"></textarea></label>
                  <label><span>Decision｜どう判断したか</span><textarea id="v74Decision"></textarea></label>
                  <label><span>Support Correction｜どう修正したか</span><textarea id="v74Correction"></textarea></label>
                  <label><span>Transfer Rule｜別条件にも使える原則</span><textarea id="v74Rule"></textarea></label>
                  <label><span>Next Test｜次に確かめること</span><textarea id="v74Next"></textarea></label>
                </div>
              </section>
            </main>
            <aside>
              <div class="v74-modal-guide"><span>COMPARE</span><h3 id="v74ModeLabel">Before / After</h3><p id="v74ModeDescription">施術前と仕上がりを比較</p></div>
              <div class="v74-modal-guide light"><span>HISTORY</span><div id="v74AssetHistory"></div></div>
            </aside>
          </div>
          <footer class="v74-modal-actions">
            <button id="v74DeleteAsset" class="btn danger hidden" data-v74-action="delete-asset">アーカイブせず削除</button>
            <div></div>
            <button class="btn secondary" data-v74-action="close-asset">キャンセル</button>
            <button id="v74SaveAsset" class="btn primary" data-v74-action="save-asset">比較資産を保存</button>
          </footer>
        </div>
      </div>
    `);
  }

  function roleOptions(mode, selected) {
    const roles = modeInfo(mode).roles;
    const all = [...roles, ["other", "Other"]]
      .filter((item, index, values) => values.findIndex(value => value[0] === item[0]) === index);
    return all.map(([id, label]) => `<option value="${id}" ${selected === id ? "selected" : ""}>${safe(label)}</option>`).join("");
  }

  function defaultRole(mode, index) {
    return modeInfo(mode).roles[Math.min(index, modeInfo(mode).roles.length - 1)]?.[0] || "image";
  }

  function defaultLabel(mode, index) {
    return modeInfo(mode).roles[Math.min(index, modeInfo(mode).roles.length - 1)]?.[1] || `Image ${index + 1}`;
  }

  function renderDraftImages() {
    const root = document.getElementById("v74DraftImages");
    if (!root) return;
    const mode = document.getElementById("v74Mode")?.value || "before-after";
    root.innerHTML = draftImages.length ? draftImages.map((image, index) => `
      <article class="v74-image-editor" data-image-id="${safe(image.id)}">
        <div class="v74-image-canvas"><img src="${safe(image.src)}" alt=""><b>${index + 1}</b></div>
        <div class="v74-image-fields">
          <div>
            <label><span>役割</span><select data-v74-image-field="role">${roleOptions(mode, image.role)}</select></label>
            <label><span>表示ラベル</span><input data-v74-image-field="label" value="${safe(image.label || "")}"></label>
            <label><span>撮影日</span><input type="date" data-v74-image-field="capturedAt" value="${safe(image.capturedAt || "")}"></label>
          </div>
          <label><span>画像メモ</span><textarea data-v74-image-field="note" placeholder="角度・条件・この画像で見る点">${safe(image.note || "")}</textarea></label>
          <div class="v74-image-actions">
            <button class="btn secondary small" data-v74-action="move-image" data-direction="-1" data-id="${safe(image.id)}" ${index === 0 ? "disabled" : ""}>←</button>
            <button class="btn secondary small" data-v74-action="move-image" data-direction="1" data-id="${safe(image.id)}" ${index === draftImages.length - 1 ? "disabled" : ""}>→</button>
            <button class="btn danger small" data-v74-action="remove-image" data-id="${safe(image.id)}">外す</button>
          </div>
        </div>
      </article>
    `).join("") : `
      <button class="v74-image-drop" data-v74-action="choose-images">
        <span>＋</span><b>画像を2枚以上追加</b><small>一度に複数選択できます</small>
      </button>
    `;
    const guide = draftImages.length >= 2
      ? `${draftImages.length}枚で比較できます`
      : draftImages.length === 1 ? "あと1枚追加すると比較できます" : "画像を追加してください";
    root.insertAdjacentHTML("beforeend", `<div class="v74-image-count ${draftImages.length >= 2 ? "ready" : ""}">${safe(guide)}</div>`);
  }

  function fillModels(selectedId, modelName) {
    const select = document.getElementById("v74Model");
    const models = list(state.modelBookings);
    select.innerHTML = `<option value="">モデル予定と紐付けない</option>${models.map(model => `<option value="${safe(model.id)}" ${selectedId === model.id ? "selected" : ""}>${safe(`${model.date || ""} ${model.name || "モデル"} ${model.menu || ""}`)}</option>`).join("")}`;
    document.getElementById("v74ModelName").value = modelName || "";
  }

  function setReadOnly(readOnly) {
    document.querySelectorAll("#v74AssetModal input,#v74AssetModal textarea,#v74AssetModal select").forEach(field => {
      field.disabled = readOnly;
    });
    document.querySelectorAll("#v74AssetModal [data-v74-action='choose-images'],#v74AssetModal [data-v74-action='remove-image'],#v74AssetModal [data-v74-action='move-image']").forEach(button => {
      button.classList.toggle("hidden", readOnly);
    });
    document.getElementById("v74SaveAsset").classList.toggle("hidden", readOnly);
    document.getElementById("v74DeleteAsset").classList.toggle("hidden", readOnly || !editingAssetId);
  }

  function openAsset(id, focusImages = false) {
    ensureModal();
    ensureAssets();
    const asset = id ? state.library.find(item => item.id === id) : null;
    editingAssetId = asset?.id || "";
    const normalized = normalizeAsset(asset || {
      id: Core.uid("asset", `${Date.now()}-${Math.random()}`),
      title: "",
      tag: "",
      comparison: { mode: "before-after", title: "", note: "" },
      images: [],
      history: []
    }, 0);
    draftImages = Core.clone(normalized.images);
    initialImageIds = draftImages.map(image => image.id);
    document.getElementById("v74AssetHeading").textContent = asset ? normalized.title : "新しい比較資産";
    document.getElementById("v74Title").value = normalized.title === "Untitled" ? "" : normalized.title;
    document.getElementById("v74Tag").value = normalized.tag || "";
    document.getElementById("v74Mode").value = normalized.comparison?.mode || "before-after";
    document.getElementById("v74ComparisonNote").value = normalized.comparison?.note || "";
    document.getElementById("v74Case").value = normalized.case || "";
    document.getElementById("v74Decision").value = normalized.decision || "";
    document.getElementById("v74Correction").value = normalized.correction || "";
    document.getElementById("v74Rule").value = normalized.rule || "";
    document.getElementById("v74Next").value = normalized.next || "";
    fillModels(normalized.modelId || "", normalized.modelName || "");
    document.getElementById("v74DeleteAsset").classList.toggle("hidden", !asset);
    document.getElementById("v74AssetHistory").innerHTML = list(normalized.history).length
      ? list(normalized.history).slice(-8).reverse().map(row => `<p><b>${safe(row.by || "System")}</b><span>${safe(row.action || "更新")}・${safe(row.at || "")}</span></p>`).join("")
      : "<p>履歴はまだありません。</p>";
    updateModeGuide();
    renderDraftImages();
    setReadOnly(!canEdit());
    document.getElementById("v74AssetModal").classList.remove("hidden");
    if (focusImages && canEdit()) setTimeout(() => document.getElementById("v74ImageInput")?.click(), 120);
  }

  function closeAsset() {
    document.getElementById("v74AssetModal")?.classList.add("hidden");
    const input = document.getElementById("v74ImageInput");
    if (input) input.value = "";
    editingAssetId = "";
    draftImages = [];
    initialImageIds = [];
  }

  function updateModeGuide() {
    const mode = document.getElementById("v74Mode")?.value || "before-after";
    const info = modeInfo(mode);
    const label = document.getElementById("v74ModeLabel");
    const description = document.getElementById("v74ModeDescription");
    if (label) label.textContent = info.label;
    if (description) description.textContent = info.description;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const max = 1200;
          const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context2d = canvas.getContext("2d");
          context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", .76));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addImages(files) {
    const available = Math.max(0, 12 - draftImages.length);
    const selected = [...files].filter(file => file.type.startsWith("image/")).slice(0, available);
    if (!selected.length) return;
    const actor = context();
    const mode = document.getElementById("v74Mode")?.value || "before-after";
    const button = document.querySelector("[data-v74-action='choose-images']");
    if (button) button.textContent = "画像を処理中…";
    try {
      for (const file of selected) {
        const index = draftImages.length;
        draftImages.push({
          id: Core.uid("asset-image", `${Date.now()}-${index}-${Math.random()}`),
          src: await compressImage(file),
          role: defaultRole(mode, index),
          label: defaultLabel(mode, index),
          capturedAt: "",
          note: "",
          fileName: file.name,
          addedBy: actor.actorName,
          addedById: actor.actorId,
          createdAt: isoNow()
        });
      }
      renderDraftImages();
    } catch (_) {
      alert("画像を読み込めませんでした。別の画像を選択してください。");
    } finally {
      if (button) button.textContent = "＋ 画像を追加";
      document.getElementById("v74ImageInput").value = "";
    }
  }

  function collectImageFields() {
    document.querySelectorAll("#v74DraftImages .v74-image-editor").forEach(card => {
      const image = draftImages.find(item => item.id === card.dataset.imageId);
      if (!image) return;
      card.querySelectorAll("[data-v74-image-field]").forEach(field => {
        image[field.dataset.v74ImageField] = field.value.trim();
      });
    });
  }

  function saveAsset() {
    if (!canEdit()) return;
    collectImageFields();
    const title = document.getElementById("v74Title").value.trim();
    if (!title) return alert("タイトルを入力してください。");
    const actor = context();
    const previousLibrary = Core.clone(state.library);
    let asset = editingAssetId ? state.library.find(item => item.id === editingAssetId) : null;
    const creating = !asset;
    if (!asset) {
      asset = normalizeAsset({
        id: Core.uid("asset", `${Date.now()}-${Math.random()}`),
        history: [],
        staffIds: actor.staffId ? [actor.staffId] : []
      }, state.library.length);
    }
    const modelId = document.getElementById("v74Model").value;
    const model = list(state.modelBookings).find(item => item.id === modelId);
    const added = draftImages.filter(image => !initialImageIds.includes(image.id)).length;
    const removed = initialImageIds.filter(id => !draftImages.some(image => image.id === id)).length;
    const actionParts = [creating ? "作成" : "共同編集"];
    if (added) actionParts.push(`画像${added}枚追加`);
    if (removed) actionParts.push(`画像${removed}枚削除`);
    asset.title = title;
    asset.tag = document.getElementById("v74Tag").value.trim();
    asset.comparison = {
      mode: document.getElementById("v74Mode").value,
      title: modeInfo(document.getElementById("v74Mode").value).label,
      note: document.getElementById("v74ComparisonNote").value.trim()
    };
    asset.modelId = modelId;
    asset.modelName = document.getElementById("v74ModelName").value.trim() || model?.name || "";
    asset.case = document.getElementById("v74Case").value.trim();
    asset.decision = document.getElementById("v74Decision").value.trim();
    asset.correction = document.getElementById("v74Correction").value.trim();
    asset.rule = document.getElementById("v74Rule").value.trim();
    asset.next = document.getElementById("v74Next").value.trim();
    asset.images = Core.clone(draftImages);
    asset.image = draftImages[0]?.src || "";
    asset.staffIds = Array.from(new Set([...list(asset.staffIds), ...(actor.staffId ? [actor.staffId] : [])]));
    asset.updatedBy = actor.actorName;
    asset.updatedById = actor.actorId;
    asset.updatedAt = stamp();
    asset.history = [...list(asset.history), {
      at: asset.updatedAt,
      by: actor.actorName,
      byId: actor.actorId,
      role: actor.actorRole,
      staffId: actor.staffId,
      action: actionParts.join("・")
    }];
    if (creating) state.library.unshift(asset);
    try {
      save();
      closeAsset();
      render();
    } catch (_) {
      state.library = previousLibrary;
      alert("画像を保存できませんでした。画像枚数を減らすか、クラウド保存へ移行してください。");
    }
  }

  function deleteAsset() {
    if (!canEdit() || !editingAssetId) return;
    if (!confirm("このLibrary資産を削除しますか？画像と履歴も削除されます。")) return;
    state.library = state.library.filter(item => item.id !== editingAssetId);
    save();
    closeAsset();
    render();
  }

  const previousRender = render;
  render = function renderV74Library() {
    previousRender();
    renderLibraryV74();
    document.title = "Growth OS v7.4";
    const badge = document.querySelector(".brand small");
    if (badge) badge.textContent = "v7.4";
  };

  document.addEventListener("input", event => {
    if (event.target.id === "v74LibrarySearch") {
      const query = event.target.value;
      state.libraryUi.query = query;
      renderLibraryV74();
      const input = document.getElementById("v74LibrarySearch");
      if (input) {
        input.focus();
        input.setSelectionRange(query.length, query.length);
      }
    }
    const field = event.target.closest("[data-v74-image-field]");
    if (field) {
      const card = field.closest(".v74-image-editor");
      const image = draftImages.find(item => item.id === card?.dataset.imageId);
      if (image) image[field.dataset.v74ImageField] = field.value;
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "v74ImageInput") addImages(event.target.files || []);
    if (event.target.id === "v74Mode") {
      collectImageFields();
      const mode = event.target.value;
      draftImages.forEach((image, index) => {
        if (!image.role || image.role === "legacy") image.role = defaultRole(mode, index);
        if (!image.label || image.label === "既存画像") image.label = defaultLabel(mode, index);
      });
      updateModeGuide();
      renderDraftImages();
    }
    if (event.target.id === "v74Model") {
      const model = list(state.modelBookings).find(item => item.id === event.target.value);
      if (model && !document.getElementById("v74ModelName").value.trim()) {
        document.getElementById("v74ModelName").value = model.name || "";
      }
    }
  });

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-v74-action]");
    if (!button) return;
    const action = button.dataset.v74Action;
    if (action === "new-asset") openAsset("", false);
    if (action === "open-asset") openAsset(button.dataset.id, false);
    if (action === "open-images") openAsset(button.dataset.id, true);
    if (action === "close-asset") closeAsset();
    if (action === "choose-images") document.getElementById("v74ImageInput")?.click();
    if (action === "filter") {
      state.libraryUi.filter = button.dataset.filter;
      save();
      renderLibraryV74();
    }
    if (action === "move-image") {
      collectImageFields();
      const index = draftImages.findIndex(item => item.id === button.dataset.id);
      const next = index + Number(button.dataset.direction);
      if (index >= 0 && next >= 0 && next < draftImages.length) {
        [draftImages[index], draftImages[next]] = [draftImages[next], draftImages[index]];
        renderDraftImages();
      }
    }
    if (action === "remove-image") {
      collectImageFields();
      draftImages = draftImages.filter(item => item.id !== button.dataset.id);
      renderDraftImages();
    }
    if (action === "save-asset") saveAsset();
    if (action === "delete-asset") deleteAsset();
  });

  document.addEventListener("click", event => {
    if (event.target.id === "v74AssetModal") closeAsset();
  });

  ensureAssets();
  render();
})();
