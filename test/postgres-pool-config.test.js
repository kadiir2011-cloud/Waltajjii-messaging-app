"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPostgresPoolConfig, createPostgresPool } = require("../src/db/postgres-pool-config");
const validEnv = { DATABASE_URL: "postgresql://app_user:secret@example.supabase.co:5432/postgres" };

test("requires DATABASE_URL without exposing its value", () => {
  assert.throws(() => buildPostgresPoolConfig({}), /DATABASE_URL is required/);
});
test("accepts PostgreSQL URL and configures a small TLS pool and isolated schema", () => {
  const config = buildPostgresPoolConfig(validEnv);
  assert.equal(config.connectionString, validEnv.DATABASE_URL);
  assert.equal(config.max, 2);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.options, "-c search_path=waltajjii,public");
  assert.equal(config.application_name, "waltajjii");
});
test("rejects non-PostgreSQL and malformed URLs", () => {
  assert.throws(() => buildPostgresPoolConfig({ DATABASE_URL: "https://example.com" }), /postgres/);
  assert.throws(() => buildPostgresPoolConfig({ DATABASE_URL: "not-a-url" }), /valid PostgreSQL/);
  assert.throws(() => buildPostgresPoolConfig({ DATABASE_URL: "postgres://host/db" }), /host, database, username, and password/);
});
test("validates pool size for the small Render instance", () => {
  assert.throws(() => buildPostgresPoolConfig({ ...validEnv, PG_POOL_MAX: "0" }), /between 1 and 5/);
  assert.throws(() => buildPostgresPoolConfig({ ...validEnv, PG_POOL_MAX: "6" }), /between 1 and 5/);
});
test("creates a Pool only when a constructor is explicitly supplied", () => {
  let received;
  class MockPool { constructor(config) { received = config; } }
  const pool = createPostgresPool(MockPool, validEnv);
  assert.ok(pool instanceof MockPool);
  assert.equal(received.options, "-c search_path=waltajjii,public");
  assert.throws(() => createPostgresPool(null, validEnv), /Pool constructor/);
});
