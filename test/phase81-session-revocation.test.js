"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { verifyAccessToken } = require("../src/security/access-token");

const root = path.join(__dirname, "..");
const secret = "phase81-test-secret-that-is-long-enough-for-unit-tests";
process.env.JWT_SECRET = secret;

function fakeDb(tokenVersion = 0, exists = true) {
  return {
    prepare(sql) {
      assert.match(sql, /SELECT token_version AS tokenVersion FROM users WHERE id = ?/);
      return { get: () => exists ? { tokenVersion } : undefined };
    }
  };
}
function issue(version = 0, extra = {}) {
  return jwt.sign({ userId: 7, username: "tester", tokenVersion: version, ...extra }, secret, {
    expiresIn: "5m", issuer: "waltajjii", audience: "waltajjii-users"
  });
}

test("Phase 81: current session token is accepted when its version matches the account", () => {
  const claims = verifyAccessToken(issue(3), fakeDb(3));
  assert.equal(claims.userId, 7);
  assert.equal(claims.tokenVersion, 3);
});

test("Phase 81: password change/global logout revokes every older token", () => {
  assert.throws(() => verifyAccessToken(issue(2), fakeDb(3)), /revoked/i);
});

test("Phase 81: legacy tokens without a version remain valid only at account version zero", () => {
  const legacy = jwt.sign({ userId: 7, username: "tester" }, secret, {
    expiresIn: "5m", issuer: "waltajjii", audience: "waltajjii-users"
  });
  assert.equal(verifyAccessToken(legacy, fakeDb(0)).userId, 7);
  assert.throws(() => verifyAccessToken(legacy, fakeDb(1)), /revoked/i);
});

test("Phase 81: deleted accounts, malformed tokens and missing database context are rejected", () => {
  assert.throws(() => verifyAccessToken(issue(0), fakeDb(0, false)), /revoked/i);
  assert.throws(() => verifyAccessToken("not-a-token", fakeDb(0)));
  assert.throws(() => verifyAccessToken(issue(0), null));
});

test("Phase 81: all authenticated HTTP and Socket.IO entry points use revocable verification", () => {
  const files = [
    "src/routes/auth.js", "src/routes/messages.js", "src/routes/groups.js",
    "src/routes/channels.js", "src/routes/social.js", "src/routes/moments.js",
    "src/routes/uploads.js", "src/routes/calls.js", "src/server.js"
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /verifyAccessToken/, file + " must verify session version");
    assert.doesNotMatch(source, /jwt\.verify\(/, file + " must not bypass revocation");
  }
});

test("Phase 81: password change re-authenticates and rotates the token version; global logout revokes sessions", () => {
  const auth = fs.readFileSync(path.join(root, "src/routes/auth.js"), "utf8");
  assert.match(auth, /router\.post\(["']\/change-password["']/);
  assert.match(auth, /bcrypt\.compare\(currentPassword, user\.password_hash\)/);
  assert.match(auth, /token_version = \?/);
  assert.match(auth, /tokenVersion: nextVersion/);
  assert.match(auth, /router\.post\(["']\/logout-all["']/);
  assert.match(auth, /token_version = token_version \+ 1/);
  assert.equal((auth.match(/disconnectSockets\\(true\\)/g) || []).length, 2);
});

test("Phase 81: database adds token_version without resetting existing user records", () => {
  const db = fs.readFileSync(path.join(root, "src/db.js"), "utf8");
  assert.match(db, /ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0/);
});
