"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRecoveryToken,
  hashRecoveryToken,
  isRecoveryTokenExpired,
  matchesRecoveryToken,
  DEFAULT_TTL_MS,
  MAX_TTL_MS
} = require("../src/security/account-recovery-tokens");

test("Phase 87: creates a cryptographically random recovery token and stores only its digest", () => {
  const created = createRecoveryToken({ now: 1_800_000_000_000 });
  assert.equal(Buffer.from(created.token, "base64url").length, 32);
  assert.match(created.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(created.expiresAt.getTime(), 1_800_000_000_000 + DEFAULT_TTL_MS);
  assert.notEqual(created.tokenHash, created.token);
});

test("Phase 87: different generated tokens have different hashes", () => {
  const first = createRecoveryToken();
  const second = createRecoveryToken();
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
});

test("Phase 87: validates candidate tokens using a constant-time digest comparison", () => {
  const created = createRecoveryToken();
  assert.equal(matchesRecoveryToken(created.tokenHash, created.token), true);
  assert.equal(matchesRecoveryToken(created.tokenHash, "x".repeat(48)), false);
  assert.equal(matchesRecoveryToken("not-a-hash", created.token), false);
});

test("Phase 87: treats invalid and elapsed expiry values as expired", () => {
  assert.equal(isRecoveryTokenExpired(new Date(1000), 1000), true);
  assert.equal(isRecoveryTokenExpired(new Date(1001), 1000), false);
  assert.equal(isRecoveryTokenExpired("not-a-date", 1000), true);
});

test("Phase 87: enforces a short bounded token lifetime", () => {
  assert.throws(() => createRecoveryToken({ ttlMs: 0 }), /between one and thirty minutes/);
  assert.throws(() => createRecoveryToken({ ttlMs: MAX_TTL_MS + 1 }), /between one and thirty minutes/);
  assert.throws(() => createRecoveryToken({ ttlMs: 60_000.5 }), /between one and thirty minutes/);
});

test("Phase 87: rejects malformed raw tokens before hashing", () => {
  assert.throws(() => hashRecoveryToken("short"), /valid recovery token/);
});
