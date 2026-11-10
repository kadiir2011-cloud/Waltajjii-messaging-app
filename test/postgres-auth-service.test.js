"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresAuthService, AuthServiceError } = require("../src/services/postgres-auth-service");

function setup(overrides = {}) {
  const calls = [];
  const fakeDb = {
    async one(sql, params = []) {
      calls.push({ sql, params });
      if (overrides.one) return overrides.one(sql, params);
      if (sql.includes("INSERT INTO users")) return { id: 42, username: params[0] };
      if (sql.includes("SELECT id, username, password_hash")) return { id: 42, username: "Kedir", password_hash: "hash" };
      if (sql.includes("UPDATE users")) return { id: 42 };
      if (sql.includes("SELECT id, username, full_name")) return { id: 42, username: "Kedir" };
      return null;
    },
    async execute(sql, params = []) { calls.push({ sql, params }); return 1; }
  };
  const bcrypt = {
    async hash(password, rounds) { calls.push({ hash: password, rounds }); return "hash"; },
    async compare(password, hash) { calls.push({ compare: password, hash }); return password === "correct-password"; }
  };
  const jwt = { sign(payload, secret, options) { calls.push({ payload, secret, options }); return "signed-token"; } };
  return {
    calls,
    service: createPostgresAuthService({ db: fakeDb, bcrypt, jwt, jwtSecret: "x".repeat(40) }),
  };
}

test("registration validates input and inserts with PostgreSQL RETURNING id", async () => {
  const { service, calls } = setup();
  const result = await service.register({ username: "kedir_1", password: "long-password-123" });
  assert.deepEqual(result.user, { id: 42, username: "kedir_1" });
  const insert = calls.find(x => x.sql && x.sql.includes("INSERT INTO users"));
  assert.match(insert.sql, /VALUES \(\$1, \$2\) RETURNING id, username/);
  assert.deepEqual(insert.params, ["kedir_1", "hash"]);
  assert.throws(() => service.register({ username: "x", password: "short" }), AuthServiceError);
});

test("registration maps PostgreSQL unique violation to conflict", async () => {
  const { service } = setup({ one: async () => { throw Object.assign(new Error("duplicate"), { code: "23505" }); } });
  await assert.rejects(service.register({ username: "kedir_1", password: "long-password-123" }),
    error => error instanceof AuthServiceError && error.status === 409);
});

test("login uses case-insensitive username lookup and signs JWT with expected claims", async () => {
  const { service, calls } = setup();
  const result = await service.login({ username: "KEDIR", password: "correct-password" });
  assert.equal(result.token, "signed-token");
  const lookup = calls.find(x => x.sql && x.sql.includes("LOWER(username)"));
  assert.match(lookup.sql, /LOWER\(username\) = LOWER\(\$1\)/);
  const signed = calls.find(x => x.payload);
  assert.equal(signed.options.issuer, "waltajjii");
  assert.equal(signed.options.audience, "waltajjii-users");
});

test("invalid credentials return a generic unauthorized error", async () => {
  const { service } = setup();
  await assert.rejects(service.login({ username: "kedir", password: "wrong" }),
    error => error.status === 401 && error.code === "INVALID_CREDENTIALS");
});

test("profile update uses numbered parameters and validates profile fields", async () => {
  const { service, calls } = setup();
  const result = await service.updateProfile(42, { fullName: "Kedir", bio: "Cardiologist", website: "https://example.org" });
  assert.equal(result.fullName, "Kedir");
  const update = calls.find(x => x.sql && x.sql.includes("UPDATE users"));
  assert.match(update.sql, /WHERE id = \$10\s+RETURNING id/);
  await assert.rejects(service.updateProfile(42, { website: "example.org" }), error => error.code === "INVALID_WEBSITE");
});

test("profile retrieval reports a missing account", async () => {
  const { service } = setup({ one: async () => null });
  await assert.rejects(service.getProfile(99), error => error.status === 404);
});
