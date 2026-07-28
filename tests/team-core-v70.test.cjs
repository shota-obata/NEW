const assert = require("node:assert/strict");
const Core = require("../team-core-v70.js");

const legacy = {
  role: "staff",
  vision: "黒坂のVision",
  deadline: "2027-04-30",
  progress: 58,
  planned: 72,
  issue: {
    title: "異なる骨格でも設計できるか",
    age: 5,
    successConditions: ["切る前に根拠を説明できる"]
  },
  journey: {
    checkpoints: [{
      id: "cp1",
      code: "CP1",
      title: "観察",
      status: "current",
      hours: 10,
      actual: 4,
      evidenceItems: [{ id: "legacy-e1", title: "比較写真", note: "左右差を確認" }],
      supportHistory: [{ id: "old-support", by: "Support" }]
    }],
    history: []
  },
  modelBookings: [{
    id: "m1",
    name: "Model",
    date: "2027-01-01",
    note: "完成像から基準点を決められるか"
  }],
  practiceSessions: [{ id: "p1", question: "観察できたか" }],
  supportSessions: [{ id: "s1", by: "Support" }],
  library: [{
    id: "a1",
    title: "基準点",
    image: "data:image/jpeg;base64,abc",
    history: [{ by: "Support", action: "修正" }]
  }]
};

const migrated = Core.migrateLegacy(legacy, { sourceKey: "growthOS.unified.v5" });
const staffId = migrated.organization.activeStaffId;
const supportId = migrated.organization.activeSupportId;
const workspace = migrated.staffWorkspaces[staffId];

assert.equal(migrated.schemaVersion, 8);
assert.equal(migrated.organization.staffMembers.length, 1);
assert.equal(migrated.organization.supportMembers.length, 1);
assert.equal(migrated.organization.managementMembers.length, 1);
assert.ok(migrated.organization.activeStaffId);
assert.ok(migrated.organization.activeSupportId);
assert.ok(migrated.organization.activeManagementId);
for (const member of [
  ...migrated.organization.staffMembers,
  ...migrated.organization.supportMembers,
  ...migrated.organization.managementMembers
]) {
  assert.ok(member.id);
  assert.ok(member.name);
  assert.ok(member.role);
  assert.ok(member.initial);
  assert.equal(member.status, "active");
  assert.ok(member.createdAt);
  assert.ok(member.updatedAt);
}

assert.equal(workspace.visionProfile.statement, legacy.vision);
assert.equal(workspace.visionProfile.version, 2);
assert.equal(workspace.currentQuestion.text, legacy.issue.title);
assert.deepEqual(workspace.currentQuestion.successConditions, legacy.issue.successConditions);
assert.equal(workspace.evidenceRecords.length, 1);
assert.equal(workspace.evidenceRecords[0].id, "legacy-e1");
assert.equal(workspace.evidenceRecords[0].checkpointId, "cp1");
assert.deepEqual(workspace.journey.checkpoints[0].evidenceIds, ["legacy-e1"]);
assert.equal("evidenceItems" in workspace.journey.checkpoints[0], false);
assert.equal(workspace.modelBookings[0].validationQuestion, legacy.modelBookings[0].note);
assert.equal(workspace.practiceSessions.length, 1);
assert.equal(workspace.supportSessions.length, 1);
for (const legacyKey of ["vision", "issue", "progress", "planned"]) {
  assert.equal(legacyKey in workspace, false, `${legacyKey} must not be persisted`);
  assert.equal(Core.WORKSPACE_KEYS.includes(legacyKey), false);
}

assert.equal(migrated.organization.library[0].image, legacy.library[0].image);
assert.equal(migrated.organization.library[0].images.length, 1);
assert.equal(migrated.organization.library[0].images[0].src, legacy.library[0].image);
assert.equal(migrated.organization.library[0].images[0].label, "既存画像");
assert.equal(migrated.organization.library[0].history.length, 1);
assert.equal(migrated.organization.staffMembers[0].primarySupportId, supportId);
assert.ok(migrated.organization.staffMembers[0].supportMemberIds.includes(supportId));
assert.ok(migrated.organization.library[0].staffIds.includes(staffId));
assert.ok(workspace.libraryRefs.includes("a1"));

const second = Core.createMember("staff", { id: "staff-2", name: "佐藤" });
migrated.organization.staffMembers.push(second);
migrated.staffWorkspaces[second.id] = Core.createWorkspace(second.id, null, { blank: true });
const normalized = Core.normalizeOrganizationPayload(migrated);

assert.equal(normalized.organization.staffMembers.length, 2);
assert.equal(Core.deriveJourneyMetrics(normalized.staffWorkspaces["staff-2"]).progress, 0);
assert.equal(normalized.staffWorkspaces["staff-2"].practiceSessions.length, 0);
assert.equal(normalized.staffWorkspaces["staff-2"].onboarding.step, 0);
assert.equal(normalized.staffWorkspaces["staff-2"].onboarding.confirmed.vision, false);
assert.equal(normalized.staffWorkspaces["staff-2"].meta.onboardingComplete, false);
assert.equal(normalized.staffWorkspaces["staff-2"].visionProfile.version, 2);
assert.notEqual(normalized.staffWorkspaces["staff-2"].journey, workspace.journey);
assert.equal(normalized.organization.activeStaffId, staffId);

const nextState = Core.stateFromWorkspace(
  normalized.staffWorkspaces["staff-2"],
  normalized.organization.library,
  "staff",
  "home"
);
assert.equal(nextState.vision, nextState.visionProfile.statement);
assert.equal(nextState.issue.title, nextState.currentQuestion.text);
nextState.issue.title = "佐藤だけの問い";
nextState.onboarding.arrivalDefinition = "異なる条件でも自力で再現し、判断理由を説明できる";
nextState.evidenceRecords.push(Core.normalizeEvidenceRecord({
  id: "evidence-new",
  checkpointId: nextState.journey.currentCheckpointId,
  fact: "骨格条件を変えて検証した",
  judgment: "基準点の根拠を自力で説明できた",
  whySo: ["施術前の設計とAfterが一致した"],
  soWhat: "現在地を一段進める",
  nextTest: "別の髪質でも再検証する"
}, 0, { staffId: "staff-2" }));
nextState.journeyUpdates.push(Core.normalizeJourneyUpdate({
  id: "journey-update-new",
  evidenceId: "evidence-new",
  checkpointId: nextState.journey.currentCheckpointId,
  status: "pending",
  proposedQuestion: "別の髪質でも同じ根拠で設計できるか"
}, 0));
const savedSecond = Core.workspaceFromState(
  nextState,
  "staff-2",
  normalized.staffWorkspaces["staff-2"]
);
assert.equal(savedSecond.currentQuestion.text, "佐藤だけの問い");
assert.equal("issue" in savedSecond, false);
assert.equal(savedSecond.onboarding.arrivalDefinition, nextState.onboarding.arrivalDefinition);
assert.equal(savedSecond.visionProfile.statement, nextState.vision);
assert.equal(savedSecond.evidenceRecords.at(-1).id, "evidence-new");
assert.equal(savedSecond.journeyUpdates.at(-1).status, "pending");
assert.equal(normalized.staffWorkspaces[staffId].currentQuestion.text, legacy.issue.title);
assert.equal(nextState.library.length, 1);

const oldJsonImported = Core.normalizeOrganizationPayload({ state: legacy }, legacy);
const oldWorkspace = oldJsonImported.staffWorkspaces[oldJsonImported.organization.activeStaffId];
assert.equal(oldJsonImported.organization.staffMembers.length, 1);
assert.equal(oldWorkspace.visionProfile.statement, legacy.vision);
assert.equal(oldWorkspace.currentQuestion.text, legacy.issue.title);

const routeSeed = Core.createWorkspace("staff-route", {
  vision: "骨格と髪質を読み、安心感のある提案とカットを自力で完結する美容師",
  deadline: "2027-04-30",
  focusArea: "接客",
  visionProfile: {
    statement: "骨格と髪質を読み、安心感のある提案とカットを自力で完結する美容師",
    targetCustomers: "似合う髪型が分からず不安な顧客",
    customerValue: "安心して任せられる感覚",
    technicalIdentity: "条件から設計できる",
    serviceIdentity: "要望を提案へ変換できる",
    humanIdentity: "不確実さを隠さない",
    autonomyIdentity: "問いから検証を自走する",
    arrivalDefinition: "異なる条件のモデル3名で接客から施術まで自力完結する",
    priorityOrder: ["service", "technical", "autonomy", "human"]
  },
  onboarding: {
    selfAssessment: { technical: 3, service: 2, human: 4, autonomy: 3 }
  }
});
const personalJourney = Core.createPersonalJourney(routeSeed, { today: "2026-07-27" });
assert.equal(personalJourney.version, 2);
assert.equal(personalJourney.routeMode, "personalized");
assert.equal(personalJourney.generatedFrom.focusDomain, "service");
assert.ok(personalJourney.checkpoints.length >= 7);
assert.equal(personalJourney.checkpoints[0].status, "current");
assert.ok(personalJourney.checkpoints.some(checkpoint => checkpoint.type === "Diagnostic"));
assert.ok(personalJourney.checkpoints.some(checkpoint => checkpoint.type === "Optional"));
assert.ok(personalJourney.checkpoints.some(checkpoint => checkpoint.type === "Integration"));
assert.equal(personalJourney.checkpoints.at(-1).date, "2027-04-30");
assert.ok(personalJourney.checkpoints.every(checkpoint => checkpoint.evidenceRequirements.length));
assert.ok(personalJourney.domains.some(domain => domain.id === "service" && domain.status === "focus"));
assert.equal(Core.isDefaultJourney(Core.createWorkspace("blank", null, { blank: true }).journey), true);
assert.equal(Core.isDefaultJourney(personalJourney), false);

const comparisonAsset = Core.normalizeAsset({
  id: "comparison-asset",
  checkpointId: "cp1",
  evidenceIds: ["legacy-e1"],
  images: [
    { src: "before.jpg", role: "before", label: "Before" },
    { src: "after.jpg", role: "after", label: "After" },
    { src: "detail.jpg", role: "detail", label: "Side" }
  ],
  comparison: { mode: "before-after", note: "シルエット比較" }
}, 0);
assert.equal(comparisonAsset.images.length, 3);
assert.equal(comparisonAsset.image, "before.jpg");
assert.equal(comparisonAsset.comparison.mode, "before-after");
assert.equal(comparisonAsset.comparison.note, "シルエット比較");
assert.equal(comparisonAsset.journeyConnection.status, "connected");
assert.equal(comparisonAsset.journeyConnection.checkpointId, "cp1");
assert.deepEqual(comparisonAsset.evidenceIds, ["legacy-e1"]);

normalized.organization.library.push(comparisonAsset);
const exported = Core.exportPayload(normalized);
const reimported = Core.normalizeOrganizationPayload(JSON.parse(JSON.stringify(exported)));
const reimportedComparison = reimported.organization.library.find(asset => asset.id === "comparison-asset");
assert.equal(reimportedComparison.images.length, 3);
assert.equal(reimportedComparison.images[1].role, "after");
assert.equal(reimportedComparison.comparison.note, "シルエット比較");
assert.equal(reimported.schemaVersion, 8);

console.log("team-core-v70 tests passed");
