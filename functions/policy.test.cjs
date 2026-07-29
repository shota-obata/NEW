"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { __policy: policy } = require("./index.js");

function fixture() {
  return {
    organization: {
      activeStaffId: "staff-a",
      staffMembers: [
        {
          id: "staff-a",
          name: "Staff A",
          role: "staff",
          status: "active",
          primarySupportId: "support-a",
          supportMemberIds: ["support-a"]
        },
        {
          id: "staff-b",
          name: "Staff B",
          role: "staff",
          status: "active",
          primarySupportId: "support-b",
          supportMemberIds: ["support-b"]
        }
      ],
      supportMembers: [
        {
          id: "support-a",
          name: "Support A",
          role: "support",
          status: "active",
          staffIds: ["staff-a"]
        },
        {
          id: "support-b",
          name: "Support B",
          role: "support",
          status: "active",
          staffIds: ["staff-b"]
        }
      ],
      managementMembers: [
        { id: "manager-a", name: "Manager", role: "management", status: "active" }
      ],
      library: [
        { id: "shared", title: "Shared", staffIds: [] },
        { id: "asset-a", title: "A", staffIds: ["staff-a"] },
        { id: "asset-b", title: "B", staffIds: ["staff-b"] }
      ],
      auditLog: [
        { id: "audit-a", actorId: "staff-a", targetStaffId: "staff-a" },
        { id: "audit-b", actorId: "staff-b", targetStaffId: "staff-b" }
      ]
    },
    staffWorkspaces: {
      "staff-a": {
        staffId: "staff-a",
        visionProfile: { statement: "Vision A" },
        currentQuestion: { text: "Question A" },
        journey: {
          currentCheckpointId: "cp-a",
          checkpoints: [
            { id: "cp-a", status: "current", issue: "Issue A" },
            { id: "cp-next", status: "next", issue: "" }
          ]
        },
        supportSessions: [{ id: "session-a", correction: "Keep" }],
        supportRequests: [
          { id: "request-pending", status: "pending", question: "Pending" },
          { id: "request-resolved", status: "resolved", resolutionId: "session-a" }
        ],
        evidenceRecords: []
      },
      "staff-b": {
        staffId: "staff-b",
        visionProfile: { statement: "Vision B" },
        currentQuestion: { text: "Question B" },
        journey: { currentCheckpointId: "cp-b", checkpoints: [] },
        supportSessions: [],
        supportRequests: [],
        evidenceRecords: []
      }
    }
  };
}

test("Staff receives only their workspace, identity, assigned Support and connected Library", () => {
  const scoped = policy.scopedPayload(fixture(), {
    role: "staff",
    memberId: "staff-a"
  });
  assert.deepEqual(Object.keys(scoped.staffWorkspaces), ["staff-a"]);
  assert.deepEqual(scoped.organization.staffMembers.map(item => item.id), ["staff-a"]);
  assert.deepEqual(scoped.organization.supportMembers.map(item => item.id), ["support-a"]);
  assert.equal(scoped.organization.managementMembers.length, 0);
  assert.deepEqual(scoped.organization.library.map(item => item.id), ["shared", "asset-a"]);
  assert.deepEqual(scoped.organization.auditLog.map(item => item.id), ["audit-a"]);
});

test("Support receives only assigned Staff workspaces", () => {
  const scoped = policy.scopedPayload(fixture(), {
    role: "support",
    memberId: "support-a"
  });
  assert.deepEqual(Object.keys(scoped.staffWorkspaces), ["staff-a"]);
  assert.deepEqual(scoped.organization.staffMembers.map(item => item.id), ["staff-a"]);
  assert.deepEqual(scoped.organization.supportMembers.map(item => item.id), ["support-a"]);
  assert.equal(scoped.organization.managementMembers.length, 0);
});

test("Staff cannot remove or rewrite an already resolved Support request", () => {
  const current = fixture().staffWorkspaces["staff-a"].supportRequests;
  const result = policy.preserveResolvedRequest(current, [
    { id: "request-pending", status: "resolved", resolutionId: "fake" }
  ]);
  assert.equal(result.find(item => item.id === "request-pending").status, "pending");
  assert.equal(result.find(item => item.id === "request-resolved").resolutionId, "session-a");
});

test("Staff save updates their learning data without overwriting Support decisions or another Staff", () => {
  const current = fixture();
  const proposed = policy.scopedPayload(current, {
    role: "staff",
    memberId: "staff-a"
  });
  proposed.staffWorkspaces["staff-a"].currentQuestion.text = "Updated by Staff";
  proposed.staffWorkspaces["staff-a"].supportSessions = [];
  proposed.staffWorkspaces["staff-b"] = {
    currentQuestion: { text: "Unauthorized" }
  };
  const merged = policy.mergePayload(current, proposed, {
    role: "staff",
    memberId: "staff-a"
  });
  assert.equal(
    merged.staffWorkspaces["staff-a"].currentQuestion.text,
    "Updated by Staff"
  );
  assert.equal(merged.staffWorkspaces["staff-a"].supportSessions.length, 1);
  assert.equal(merged.staffWorkspaces["staff-b"].currentQuestion.text, "Question B");
});

test("Support can update Journey without deleting omitted Checkpoints or Staff Vision", () => {
  const current = fixture().staffWorkspaces["staff-a"];
  const proposed = structuredClone(current);
  proposed.visionProfile.statement = "Unauthorized Support Vision";
  proposed.journey.checkpoints = [
    { id: "cp-a", status: "done", issue: "Resolved" }
  ];
  const merged = policy.mergeWorkspace(current, proposed, {
    role: "support",
    memberId: "support-a"
  });
  assert.equal(merged.visionProfile.statement, "Vision A");
  assert.equal(merged.journey.checkpoints.length, 2);
  assert.equal(merged.journey.checkpoints.find(item => item.id === "cp-a").status, "done");
  assert.equal(merged.journey.checkpoints.find(item => item.id === "cp-next").status, "next");
});

test("PIN hashes match only the correct four digits", () => {
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = policy.derivePinHash("1234", salt);
  assert.equal(policy.pinMatches("1234", salt, hash), true);
  assert.equal(policy.pinMatches("4321", salt, hash), false);
});

test("Oversized monolithic payloads are rejected before Firestore write", () => {
  assert.throws(
    () => policy.requirePayloadSize({ image: "x".repeat(910 * 1024) }),
    /クラウド保存容量/
  );
});
