import {
  deriveLoginEmail,
  derivePinPassword,
  normalizeLoginId,
  validatePin
} from "./growth-credential-core.mjs";

const organizationId = process.env.GROWTH_ORGANIZATION_ID || "growth-os";
const loginId = normalizeLoginId(process.env.GROWTH_LOGIN_ID);
const pin = validatePin(process.env.GROWTH_PIN);

console.log(JSON.stringify({
  organizationId,
  loginId,
  email: deriveLoginEmail(organizationId, loginId),
  password: derivePinPassword(organizationId, loginId, pin)
}, null, 2));
