import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveLoginEmail,
  derivePinPassword,
  normalizeLoginId,
  validatePin
} from "../scripts/growth-credential-core.mjs";

test("login IDs are normalized before credential derivation", () => {
  assert.equal(normalizeLoginId("  Kurosaka_01  "), "kurosaka_01");
  assert.equal(
    deriveLoginEmail("growth-os", "  Kurosaka_01  "),
    deriveLoginEmail("growth-os", "kurosaka_01")
  );
});

test("the derived Firebase password is deterministic and not the PIN", () => {
  const first = derivePinPassword("growth-os", "kurosaka", "1234");
  const second = derivePinPassword("growth-os", "kurosaka", "1234");
  assert.equal(first, second);
  assert.notEqual(first, "1234");
  assert.match(first, /^GOS1-[A-Za-z0-9_-]{43}$/);
});

test("organization and login ID isolate credentials", () => {
  const base = derivePinPassword("growth-os", "kurosaka", "1234");
  assert.notEqual(base, derivePinPassword("another-org", "kurosaka", "1234"));
  assert.notEqual(base, derivePinPassword("growth-os", "obata", "1234"));
  assert.notEqual(
    deriveLoginEmail("growth-os", "kurosaka"),
    deriveLoginEmail("growth-os", "obata")
  );
});

test("invalid IDs and PINs are rejected", () => {
  assert.throws(() => normalizeLoginId("ab"));
  assert.throws(() => normalizeLoginId("黒坂"));
  assert.throws(() => validatePin("123"));
  assert.throws(() => validatePin("12a4"));
});
