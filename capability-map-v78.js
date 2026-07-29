;(() => {
  "use strict";
  if (window.__growthCapabilityV78 || !window.GrowthTeamCore) return;
  window.__growthCapabilityV78 = true;

  const Core = window.GrowthTeamCore;
  const DOMAIN = Core.DOMAIN_META;
  const STAGES = Core.JUDGMENT_STAGE_META;
  const CATALOG = Core.CAPABILITY_CATALOG;
  const safe = value => typeof esc === "function"
    ? esc(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
  const ui = {
    view: "overview",
    domainId: "",
    stageId: "",
    staffId: ""
  };

  const statusLabel = status => ({
    stable: "安定",
    growing: "成長中",
    emerging: "形成中",
    unconnected: "未接続"
  }[status] || "未接続");

  function stateData() {
    return typeof state === "object" && state ? state : {};
  }

  function activeStaff() {
    return window.GrowthTeam?.activeStaff?.() || {
      id: stateData().staffId || "",
      name: stateData().staffName || stateData().profile?.name || "Staff",
      initial: "S"
    };
  }

  function metrics() {
    return Core.deriveCapabilityMap(stateData());
  }

  function ensurePage() {
    const main = document.querySelector(".shell > main");
    if (!main || document.getElementById("capability")) return;
    main.insertAdjacentHTML("beforeend", '<section id="capability" class="page"></section>');
  }

  function ensureNavigation() {
    const side = document.getElementById("side");
    if (side && !side.querySelector('[data-page="capability"]')) {
      const button = document.createElement("button");
      button.className = "nav";
      button.dataset.page = "capability";
      button.textContent = "Capability Map";
      const journey = side.querySelector('[data-page="journey"]');
      if (journey) journey.insertAdjacentElement("afterend", button);
      else side.prepend(button);
    }
    const journeyHead = document.querySelector("#journey .v72-head-actions");
    if (journeyHead && !journeyHead.querySelector('[data-page="capability"]')) {
      const button = document.createElement("button");
      button.className = "btn secondary";
      button.dataset.page = "capability";
      button.textContent = "Capability Map";
      journeyHead.prepend(button);
    }
    document.querySelectorAll(".nav").forEach(button => {
      button.classList.toggle("active", button.dataset.page === stateData().page);
    });
  }

  function ensureMobileMenu() {
    const panel = document.querySelector(".v60-mobile-panel");
    if (!panel || panel.querySelector('[data-page="capability"]')) return;
    const button = document.createElement("button");
    button.dataset.page = "capability";
    button.dataset.v60Action = "close-mobile-menu";
    button.textContent = "Capability Map";
    panel.appendChild(button);
  }

  function roleLens() {
    const role = stateData().role || "staff";
    if (role === "support") {
      return {
        label: "Support lens",
        text: "Staffの強弱を採点せず、判断が止まる工程と根拠不足を見つけます。",
        action: "比較質問をつくる"
      };
    }
    if (role === "management") {
      return {
        label: "Management lens",
        text: "個人の点数ではなく、未接続データと育成構造の停滞を見つけます。",
        action: "介入先を決める"
      };
    }
    return {
      label: "Staff lens",
      text: "今どこまでできるかと、次にどの判断を育てるかを確認します。",
      action: "次の経験を選ぶ"
    };
  }

  function roleAction() {
    const role = stateData().role || "staff";
    if (role === "support") return { page: "support", label: "Supportで判断を修正" };
    if (role === "management") return { page: "management", label: "Managementで停滞を見る" };
    return { page: "practice", label: "次のPracticeへ" };
  }

  function header(person) {
    const lens = roleLens();
    return `
      <header class="cap78-pagehead">
        <div>
          <div class="eyebrow">CAPABILITY MAP / ${safe(person.name)}</div>
          <h1>強さと未接続を、根拠から見る。</h1>
          <p>中央の数値は自己申告の点数ではありません。Journey・Checkpoint・Practice・Evidenceの接続から、現在確認できる能力領域を可視化します。</p>
        </div>
      </header>
      <div class="cap78-lens">
        <div><b>${safe(lens.label)}</b><strong>${safe(lens.action)}</strong></div>
        <span>${safe(lens.text)}</span>
      </div>
    `;
  }

  function toolbar(view, title) {
    return `
      <div class="cap78-toolbar">
        <div class="cap78-breadcrumb">
          <button data-cap78-action="overview">Capability Map</button>
          ${title ? `<i>›</i><span>${safe(title)}</span>` : ""}
        </div>
        <div class="cap78-viewtoggle" aria-label="Capability Mapの深さ">
          <button class="${view === "overview" ? "active" : ""}" data-cap78-action="overview">全体</button>
          <button class="${view === "domains" || view === "domain" ? "active" : ""}" data-cap78-action="domains">能力領域</button>
          <button class="${view === "stages" ? "active" : ""}" data-cap78-action="stages">判断工程</button>
        </div>
      </div>
    `;
  }

  function logic(whySo, soWhat) {
    return `
      <section class="cap78-logic">
        <article><span>WHY SO?</span><p>${safe(whySo)}</p></article>
        <article><span>SO WHAT?</span><p>${safe(soWhat)}</p></article>
      </section>
    `;
  }

  function nodeButton(node, position) {
    const page = node.page || "";
    const action = node.action || "";
    const attributes = page
      ? `data-page="${safe(page)}"`
      : `data-cap78-action="${safe(action)}"`;
    return `
      <button class="cap78-node ${safe(node.status)}" style="left:${position.x}%;top:${position.y}%" ${attributes}>
        <i>${safe(statusLabel(node.status))}</i>
        <h3>${safe(node.label)}</h3>
        <footer><span>${safe(node.sourceCount || 0)} sources</span><b>${Number(node.score) || 0}%</b></footer>
      </button>
    `;
  }

  function renderLoopAudit(audit) {
    const stateLabel = status => ({
      connected: "接続済み",
      partial: "途中",
      missing: "未接続"
    }[status] || "未接続");
    return `
      <section class="cap78-audit">
        <header>
          <div>
            <div class="eyebrow">MECE / GROWTH LOOP AUDIT</div>
            <h2>経験が、次の問いまで戻っているか。</h2>
            <p>コアループ9接続と、Library・Supportの横断2接続を別の切り口で監査します。</p>
          </div>
          <div class="cap78-audit-score"><b>${audit.percent}%</b><span>接続率</span></div>
        </header>
        <div class="cap78-audit-summary">
          <span><b>${audit.connectedCount}</b> 接続済み</span>
          <span><b>${audit.partialCount}</b> 途中</span>
          <span><b>${audit.missingCount}</b> 未接続</span>
        </div>
        <div class="cap78-audit-grid">
          ${audit.edges.map(edge => `
            <button class="${safe(edge.status)} ${audit.next?.id === edge.id ? "next" : ""}" data-page="${safe(edge.page)}">
              <span>${safe(stateLabel(edge.status))}${audit.next?.id === edge.id ? " · 次に接続" : ""}</span>
              <b>${safe(edge.label)}</b>
              <small>${safe(edge.whySo)}</small>
              <i><em style="width:${edge.percent}%"></em></i>
            </button>
          `).join("")}
        </div>
        ${audit.next ? `
          <footer>
            <span>SO WHAT?</span>
            <p>${safe(audit.next.soWhat)}</p>
            <button class="btn primary" data-page="${safe(audit.next.page)}">次の接続を修正</button>
          </footer>
        ` : ""}
      </section>
    `;
  }

  function renderOverview(person, map) {
    const audit = Core.auditGrowthLoop(stateData());
    const domainSources = map.domains.reduce((sum, item) => sum + item.sourceCount, 0);
    const domainNode = {
      id: "domains",
      label: "能力領域",
      score: map.overall,
      status: map.status,
      sourceCount: domainSources,
      action: "domains"
    };
    const stageSourceCount = map.stages.reduce((sum, item) => sum + item.sourceCount, 0);
    const stageScore = stageSourceCount
      ? Math.round(map.stages.reduce((sum, item) => sum + item.score * item.sourceCount, 0) / stageSourceCount)
      : 0;
    const stageNode = {
      id: "stages",
      label: "判断工程",
      score: stageScore,
      status: stageSourceCount ? (stageScore >= 80 ? "stable" : stageScore >= 45 ? "growing" : "emerging") : "unconnected",
      sourceCount: stageSourceCount,
      action: "stages"
    };
    const systemMap = Object.fromEntries(map.systems.map(item => [item.id, item]));
    const ordered = [
      systemMap.vision,
      systemMap.journey,
      systemMap.practice,
      systemMap.support,
      systemMap.planner,
      domainNode,
      stageNode,
      systemMap.evidence,
      systemMap.question,
      systemMap.library
    ].filter(Boolean);
    const positions = [
      { x: 50, y: 10 },
      { x: 76, y: 16 },
      { x: 91, y: 34 },
      { x: 91, y: 65 },
      { x: 75, y: 88 },
      { x: 50, y: 90 },
      { x: 25, y: 88 },
      { x: 9, y: 65 },
      { x: 9, y: 34 },
      { x: 24, y: 16 }
    ];
    const lines = positions.map(position =>
      `<line x1="50%" y1="50%" x2="${position.x}%" y2="${position.y}%"></line>`
    ).join("");
    return `
      ${toolbar("overview", "")}
      <section class="cap78-canvas" aria-label="${safe(person.name)}のCapability Map">
        <svg class="cap78-lines" aria-hidden="true">${lines}</svg>
        <div class="cap78-center">
          <div>
            <span>STAFF</span>
            <strong>${safe(person.name)}</strong>
            <b>${map.overall}<em>%</em></b>
            <small>Evidence-based</small>
          </div>
        </div>
        ${ordered.map((node, index) => nodeButton(node, positions[index])).join("")}
        <div class="cap78-orphan"><span>未接続データ</span><b>${map.orphan.total}</b></div>
      </section>
      ${logic(
        `${map.calculation} 現在は${domainSources}件の能力領域ソースを参照しています。`,
        map.orphan.total
          ? `${map.orphan.total}件の孤立データをCheckpointへ接続すると、現在地と次の問いの精度が上がります。`
          : "各ノードを開き、次に深める領域を一つ選びます。"
      )}
      ${renderLoopAudit(audit)}
    `;
  }

  function renderDomains(map) {
    return `
      ${toolbar("domains", "能力領域")}
      <section class="cap78-domain-stage">
        <header class="cap78-domain-head">
          <div>
            <div class="eyebrow">LEVEL 2 / CAPABILITY DOMAINS</div>
            <h2>どの領域に、どれだけ根拠があるか。</h2>
            <p>技術・接客・人間力・自走力を同じ基準で比較します。自己設定は参考値として分離し、主スコアにはCheckpointとEvidenceだけを使います。</p>
          </div>
        </header>
        <div class="cap78-domain-grid">
          ${map.domains.map(domain => `
            <button class="cap78-domain-card" style="--domain:${safe(domain.color)}" data-cap78-domain="${safe(domain.id)}">
              <header><i></i><span class="cap78-status ${safe(domain.status)}">${safe(statusLabel(domain.status))}</span></header>
              <b>${domain.score}<small>%</small></b>
              <h3>${safe(domain.label)}</h3>
              <p>${safe(domain.whySo)}</p>
              <div class="cap78-domain-bar"><i style="width:${domain.score}%"></i></div>
              <footer class="cap78-domain-foot">
                <span>自己設定 ${domain.selfScore}%</span>
                <span>Evidence ${domain.evidenceCount}件</span>
              </footer>
            </button>
          `).join("")}
        </div>
      </section>
      ${logic(
        "4領域は重複しない能力の切り口です。各領域の値は、その領域へ接続されたCheckpointを必要時間で加重し、Evidence・実践時間・確信度から算出します。",
        "最も低い領域を自動的な弱点とは決めません。Visionに必要かを確認し、必要で未接続ならJourneyへ追加します。"
      )}
    `;
  }

  function renderStages(map) {
    return `
      ${toolbar("stages", "判断工程")}
      <section class="cap78-domain-stage">
        <header class="cap78-domain-head">
          <div>
            <div class="eyebrow">LEVEL 2 / JUDGMENT STAGES</div>
            <h2>どこで判断が止まるか。</h2>
            <p>観察 → 解釈 → 設計 → 実行 → 確認 → 修正 → 転用を、スタイル名ではなく判断生成の工程として比較します。</p>
          </div>
        </header>
        <div class="cap78-skill-list">
          ${map.stages.map(stage => `
            <article class="cap78-skill-card ${safe(stage.status)}" style="--domain:var(--blue)">
              <i>${stage.order}</i>
              <div class="cap78-skill-copy">
                <small>${safe(statusLabel(stage.status))} · ${stage.sourceCount} Checkpoint</small>
                <h4>${safe(stage.label)}</h4>
              </div>
              <div class="cap78-skill-score"><b>${stage.score}%</b><span>現在地</span></div>
              <div class="cap78-skill-bar"><i style="width:${stage.score}%"></i></div>
            </article>
          `).join("")}
        </div>
      </section>
      ${logic(
        "各Checkpointは一つの主判断工程へ接続します。同じCheckpointを複数工程へ重複計上しません。",
        "未接続工程がVision達成に必要ならCheckpointを追加し、必要でなければ無理に埋めません。"
      )}
    `;
  }

  function domainSkillRows(domain, map) {
    return Object.keys(STAGES).map(stageId => {
      const related = map.checkpointMetrics.filter(item =>
        item.domain === domain.id && item.judgmentStage === stageId
      );
      const score = related.length
        ? Math.round(related.reduce((sum, item) => sum + item.score, 0) / related.length)
        : 0;
      const evidenceCount = related.reduce((sum, item) => sum + item.evidenceCount, 0);
      return {
        id: stageId,
        order: STAGES[stageId].order,
        stageLabel: STAGES[stageId].label,
        label: CATALOG[domain.id]?.[stageId] || STAGES[stageId].label,
        score,
        evidenceCount,
        checkpointCount: related.length,
        status: related.length ? (score >= 80 ? "stable" : score >= 45 ? "growing" : "emerging") : "unconnected",
        checkpoints: related
      };
    });
  }

  function renderDomainDetail(map, domain) {
    const skills = domainSkillRows(domain, map);
    const action = roleAction();
    const shallow = skills.filter(item => item.status === "unconnected" || item.score < 45);
    return `
      ${toolbar("domain", `能力領域 › ${domain.label}`)}
      <section class="cap78-skill-stage" style="--domain:${safe(domain.color)}">
        <header class="cap78-skill-head">
          <div>
            <div class="eyebrow">LEVEL 3 / ${safe(domain.label)}</div>
            <h2>${safe(domain.label)}の深さを、7つの判断工程で見る。</h2>
            <p>大きな「技術が弱い」では終わらせず、観察・解釈・設計・実行・確認・修正・転用のどこに根拠があり、どこが未接続かを分けます。</p>
          </div>
          <button class="btn primary" data-page="${safe(action.page)}">${safe(action.label)}</button>
        </header>
        <div class="cap78-skill-tree">
          <aside class="cap78-skill-root">
            <span>${safe(statusLabel(domain.status))}</span>
            <b>${domain.score}<small>%</small></b>
            <h3>${safe(domain.label)}</h3>
            <p>${safe(domain.whySo)}</p>
            <div class="cap78-domain-bar"><i style="width:${domain.score}%"></i></div>
          </aside>
          <div class="cap78-skill-list">
            ${skills.map(skill => `
              <article class="cap78-skill-card ${safe(skill.status)}">
                <i>${skill.order}</i>
                <div class="cap78-skill-copy">
                  <small>${safe(skill.stageLabel)} · ${skill.checkpointCount} CP · ${skill.evidenceCount} Evidence</small>
                  <h4>${safe(skill.label)}</h4>
                </div>
                <div class="cap78-skill-score"><b>${skill.score}%</b><span>${safe(statusLabel(skill.status))}</span></div>
                <div class="cap78-skill-bar"><i style="width:${skill.score}%"></i></div>
              </article>
            `).join("")}
          </div>
        </div>
        <div class="cap78-evidence-panel">
          <div><span>CHECKPOINT</span><b>${domain.checkpointCount}件</b></div>
          <div><span>EVIDENCE</span><b>${domain.evidenceCount}件</b></div>
          <div><span>NEXT KEY</span><b>${safe(shallow[0]?.stageLabel || "条件転用")}</b></div>
        </div>
      </section>
      ${logic(
        domain.whySo,
        shallow.length
          ? `${shallow[0].stageLabel}の「${shallow[0].label}」は${statusLabel(shallow[0].status)}です。Visionに必要なら、次の問いとCheckpointへ接続します。`
          : domain.soWhat
      )}
    `;
  }

  function renderCapability() {
    ensurePage();
    ensureNavigation();
    const root = document.getElementById("capability");
    if (!root || stateData().page !== "capability") return;
    const person = activeStaff();
    if (ui.staffId && ui.staffId !== person.id) {
      ui.view = "overview";
      ui.domainId = "";
      ui.stageId = "";
    }
    ui.staffId = person.id;
    const map = metrics();
    let content = renderOverview(person, map);
    if (ui.view === "domains") content = renderDomains(map);
    if (ui.view === "stages") content = renderStages(map);
    if (ui.view === "domain") {
      const domain = map.domains.find(item => item.id === ui.domainId) || map.domains[0];
      content = renderDomainDetail(map, domain);
    }
    root.innerHTML = `${header(person)}${content}`;
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.id === stateData().page);
    });
    ensureNavigation();
  }

  const previousRender = render;
  render = function renderWithCapabilityV78() {
    previousRender();
    const versionLabel = `v${window.GROWTH_VERSION || "7.9"}`;
    document.title = `Growth OS ${versionLabel}`;
    const version = document.querySelector(".brand small");
    if (version) version.textContent = versionLabel;
    ensurePage();
    ensureNavigation();
    renderCapability();
  };

  document.addEventListener("click", event => {
    if (event.target.closest('[data-v60-action="open-mobile-menu"]')) {
      setTimeout(ensureMobileMenu, 0);
    }
    const action = event.target.closest("[data-cap78-action]");
    if (action) {
      const name = action.dataset.cap78Action;
      if (name === "overview") {
        ui.view = "overview";
        ui.domainId = "";
      }
      if (name === "domains") {
        ui.view = "domains";
        ui.domainId = "";
      }
      if (name === "stages") {
        ui.view = "stages";
        ui.domainId = "";
      }
      renderCapability();
      return;
    }
    const domain = event.target.closest("[data-cap78-domain]");
    if (domain) {
      ui.view = "domain";
      ui.domainId = domain.dataset.cap78Domain;
      renderCapability();
    }
  });

  ensurePage();
  render();
})();
