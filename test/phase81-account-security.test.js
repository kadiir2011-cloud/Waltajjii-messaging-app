"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateNewPassword } = require("../src/security/password-policy");

test("Phase 81 accepts long unique passphrases without arbitrary complexity rules", () => {
  assert.equal(validateNewPassword("River coffee sunrise 2026!", "kedir"), null);
  assert.equal(validateNewPassword("correct horse battery staple", "kedir"), null);
});

test("Phase 81 rejects short and oversized passwords", () => {
  assert.match(validateNewPassword("shortpass", "user"), /12 and 128/);
  assert.match(validateNewPassword("x".repeat(129), "user"), /12 and 128/);
});

test("Phase 81 rejects common weak passwords and username inclusion", () => {
  assert.match(validateNewPassword("Password1234", "member"), /common password/i);
  assert.match(validateNewPassword("Kedir is my password 2026", "kedir"), /username/i);
});

test("Phase 81 rejects simple repeated and predictable sequences", () => {
  assert.match(validateNewPassword("aaaaaaaaaaaa", "member"), /unpredictable/i);
  assert.match(validateNewPassword("123456abcdef", "member"), /unpredictable/i);
});

test("Phase 81 handles non-string values safely", () => {
  assert.match(validateNewPassword(null, "member"), /12 and 128/);
  assert.match(validateNewPassword({}, "member"), /12 and 128/);
});
