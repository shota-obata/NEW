const assert = require("node:assert/strict");
const Core = require("../team-core-v70.js");

const legacy = {
  role: "staff",
  vision: "黒坂のVision",
  deadline: "2027-04-30",
  progress: 58,
  planned: 72,
  issue: { title: "異なる骨格でも設計できるか", age: 5 },
  journey: {
    checkpoints: [{
      id: "cp1",
      code: "CP1",
      title: "観察",
      status: "current",
      hours: 10,
      actual: 4,
      evidenceItems: [{ title: "比較写真" }],
      supportHistory: [{ id: "old-support", by: "Support" }]
    }],
    history: []
  },
  modelBookings: [{ id: "m1", name: "Model", date: "2027-01-01" }],
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

assert.equal(migrated.schemaVersion, 7);
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
assert.equal(workspace.vision, legacy.vision);
assert.equal(workspace.visionProfile.statement, legacy.vision);
assert.equal(workspace.visionProfile.version, 2);
assert.equal(workspace.journey.checkpoints[0].evidenceItems.length, 1);
assert.equal(workspace.modelBookings.length, 1);
assert.equal(workspace.practiceSessions.length, 1);
assert.equal(workspace.supportSessions.length, 1);
assert.equal(migrated.organization.library[0].image, legacy.library[0].image);
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
assert.equal(normalized.staffWorkspaces["staff-2"].progress, 0);
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
nextState.issue.title = "佐藤だけの問い";
nextState.onboarding.arrivalDefinition = "異なる条件でも自力で再現し、判断理由を説明できる";
const savedSecond = Core.workspaceFromState(
  nextState,
  "staff-2",
  normalized.staffWorkspaces["staff-2"]
);
assert.equal(savedSecond.issue.title, "佐藤だけの問い");
assert.equal(savedSecond.onboarding.arrivalDefinition, nextState.onboarding.arrivalDefinition);
assert.equal(savedSecond.visionProfile.statement, nextState.vision);
assert.equal(normalized.staffWorkspaces[staffId].issue.title, legacy.issue.title);
assert.equal(nextState.library.length, 1);

const oldJsonImported = Core.normalizeOrganizationPayload({ state: legacy }, legacy);
assert.equal(oldJsonImported.organization.staffMembers.length, 1);
assert.equal(oldJsonImported.staffWorkspaces[oldJsonImported.organization.activeStaffId].vision, legacy.vision);

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

console.log("team-core-v70 tests passed");
