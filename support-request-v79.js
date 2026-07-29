;(() => {
  "use strict";
  if (window.__growthSupportRequestV79 || !window.GrowthTeamCore) return;
  window.__growthSupportRequestV79 = true;

  const Core = window.GrowthTeamCore;
  const list = value => Array.isArray(value) ? value : [];

  function currentCheckpoint() {
    const checkpoints = list(state?.journey?.checkpoints);
    return checkpoints.find(item => item.id === state?.journey?.currentCheckpointId) ||
      checkpoints.find(item => item.status === "current") ||
      checkpoints[0] ||
      null;
  }

  function createRequest(sourcePage = "home") {
    if (state?.role !== "staff") return null;
    const checkpoint = currentCheckpoint();
    const staff = window.GrowthTeam?.activeStaff?.() || {};
    const question = state.currentQuestion || state.issue || {};
    const relatedEvidence = list(state.evidenceRecords)
      .filter(item => !checkpoint || item.checkpointId === checkpoint.id)
      .map(item => item.id)
      .filter(Boolean);
    const evidenceIds = Array.from(new Set([
      ...list(question.evidenceIds),
      ...list(checkpoint?.evidenceIds),
      ...relatedEvidence
    ]));
    state.supportRequests = list(state.supportRequests);
    const existing = state.supportRequests.find(item => (
      ["pending", "acknowledged"].includes(item.status) &&
      item.checkpointId === (checkpoint?.id || "") &&
      item.questionText === (question.text || question.title || "")
    ));
    const values = {
      id: existing?.id || Core.uid("support-request", `${Date.now()}-${Math.random()}`),
      staffId: staff.id || state.staffId || "",
      supportId: staff.primarySupportId || state.primarySupportId || "",
      checkpointId: checkpoint?.id || "",
      checkpointCode: checkpoint?.code || "",
      checkpointTitle: checkpoint?.title || "",
      domain: checkpoint?.domain || "",
      judgmentStage: checkpoint?.judgmentStage || Core.inferJudgmentStage(checkpoint || {}),
      questionText: question.text || question.title || checkpoint?.issue || "",
      visionSnapshot: state.visionProfile?.statement || state.vision || "",
      evidenceIds,
      sourcePage,
      whySo: question.whyNow ||
        `${checkpoint?.code || "Current Checkpoint"}と${evidenceIds.length}件のEvidenceを基に相談`,
      soWhat: "Supportは答えを渡さず、比較質問・判断修正・次の再検証条件を返す",
      status: existing?.status || "pending",
      requestedAt: new Date().toISOString(),
      requestedBy: staff.name || "Staff"
    };
    const normalized = Core.normalizeSupportRequest(
      Object.assign({}, existing || {}, values),
      state.supportRequests.length,
      {
        staffId: values.staffId,
        supportId: values.supportId,
        checkpointId: values.checkpointId
      }
    );
    if (existing) {
      Object.assign(existing, normalized);
    } else {
      state.supportRequests.push(normalized);
    }
    state.page = "support";
    if (window.GrowthTeam?.commitState) {
      window.GrowthTeam.commitState();
    } else if (typeof save === "function") {
      save();
    }
    if (typeof render === "function") render();
    return normalized;
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-support-request]");
    if (!trigger || state?.role !== "staff") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    createRequest(trigger.dataset.supportRequest || state.page || "home");
  }, true);

  window.GrowthSupportRequest = { createRequest };
})();
