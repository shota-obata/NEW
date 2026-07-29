import fs from "node:fs/promises";

const [projectId, bootstrapKey, payloadPath, loginId, pin, memberId, organizationId = "growth-os"] =
  process.argv.slice(2);

if (!projectId || !bootstrapKey || !payloadPath || !loginId || !/^\d{4}$/.test(pin || "") || !memberId) {
  console.error(
    "Usage: node scripts/bootstrap-cloud.mjs <projectId> <bootstrapKey> <payload.json> <loginId> <4digitPin> <managementMemberId> [organizationId]"
  );
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
const endpoint = `https://asia-northeast1-${projectId}.cloudfunctions.net/bootstrapGrowth`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    data: {
      organizationId,
      bootstrapKey,
      payload,
      loginId,
      pin,
      memberId
    }
  })
});
const result = await response.json();
if (!response.ok || result.error) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log("Growth OS cloud bootstrap completed.");
