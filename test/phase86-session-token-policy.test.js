"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectSessionClaims, MAX_SESSION_SECONDS } = require("../src/security/session-token-policy");

const now = 1_800_000_000;
function validClaims(overrides = {}) {
  return {
    iss: "waltajjii",
    aud: "waltajjii-users",
    userId: 42,
    username: "test_user",
    iat: now - 30,
    exp: now + MAX_SESSION_SECONDS - 30,
    ...overrides
  };
}

test("Phase 86: accepts a correctly scoped session within the two-hour lifetime", () => {
  const result = inspectSessionClaims(validClaims(), now);
  assert.equal(result.valid, true);
  assert.equal(result.userId, 42);
  assert.equal(result.username, "test_user");
});

test("Phase 86: accepts an audience array containing the Waltajjii audience", () => {
  assert.equal(inspectSessionClaims(validClaims({ aud: ["other", "waltajjii-users"] }), now).valid, true);
});

test("Phase 86: rejects malformed payloads and incorrect issuer or audience", () => {
  assert.equal(inspectSessionClaims(null, now).reason, "invalid-payload");
  assert.equal(inspectSessionClaims(validClaims({ iss: "attacker" }), now).reason, "invalid-issuer");
  assert.equal(inspectSessionClaims(validClaims({ aud: "other" }), now).reason, "invalid-audience");
});

test("Phase 86: rejects invalid user identifiers and usernames", () => {
  assert.equal(inspectSessionClaims(validClaims({ userId: 0 }), now).reason, "invalid-user");
  assert.equal(inspectSessionClaims(validClaims({ username: "bad name" }), now).reason, "invalid-username");
});

test("Phase 86: rejects missing, expired, or future-issued tokens", () => {
  assert.equal(inspectSessionClaims(validClaims({ exp: undefined }), now).reason, "expired-or-missing-expiry");
  assert.equal(inspectSessionClaims(validClaims({ exp: now }), now).reason, "expired-or-missing-expiry");
  assert.equal(inspectSessionClaims(validClaims({ iat: now + 61 }), now).reason, "invalid-issued-at");
});

test("Phase 86: rejects sessions whose declared lifetime exceeds two hours", () => {
  assert.equal(
    inspectSessionClaims(validClaims({ iat: now - 10, exp: now + MAX_SESSION_SECONDS + 1 }), now).reason,
    "session-lifetime-exceeded"
  );
});
