import { createHash, pbkdf2Sync } from "node:crypto";

export function normalizeLoginId(value) {
  const loginId = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) {
    throw new Error("Login ID must be 3-32 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  return loginId;
}

export function validatePin(value) {
  const pin = String(value || "");
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly four digits.");
  }
  return pin;
}

export function deriveLoginEmail(organizationId, loginId) {
  const normalized = normalizeLoginId(loginId);
  const digest = createHash("sha256")
    .update(`${organizationId}:${normalized}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${digest}@growth-os.invalid`;
}

export function derivePinPassword(organizationId, loginId, pin) {
  const normalized = normalizeLoginId(loginId);
  const checkedPin = validatePin(pin);
  const bits = pbkdf2Sync(
    checkedPin,
    `growth-os:v1:${organizationId}:${normalized}`,
    120000,
    32,
    "sha256"
  );
  return `GOS1-${bits.toString("base64url")}`;
}
