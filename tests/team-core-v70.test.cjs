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
assert.notEqual(normalized.staffWorkspaces["staff-2"].journey, workspace.journey);
assert.equal(normalized.organization.activeStaffId, staffId);

const nextState = Core.stateFromWorkspace(
  normalized.staffWorkspaces["staff-2"],
  normalized.organization.library,
  "staff",
  "home"
);
nextState.issue.title = "佐藤だけの問い";
const savedSecond = Core.workspaceFromState(
  nextState,
  "staff-2",
  normalized.staffWorkspaces["staff-2"]
);
assert.equal(savedSecond.issue.title, "佐藤だけの問い");
assert.equal(normalized.staffWorkspaces[staffId].issue.title, legacy.issue.title);
assert.equal(nextState.library.length, 1);

const oldJsonImported = Core.normalizeOrganizationPayload({ state: legacy }, legacy);
assert.equal(oldJsonImported.organization.staffMembers.length, 1);
assert.equal(oldJsonImported.staffWorkspaces[oldJsonImported.organization.activeStaffId].vision, legacy.vision);

console.log("team-core-v70 tests passed");
