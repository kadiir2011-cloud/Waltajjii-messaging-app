"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertDisposablePostgresDatabaseUrl } = require("../src/postgres/postgres-test-database-guard");

test("allows an explicitly opted-in staging PostgreSQL database", () => {
  const url = "postgresql://user:password@localhost:5432/waltajjii_staging";
  assert.equal(assertDisposablePostgresDatabaseUrl(url, "1"), url);
});

test("refuses production-like database names even with explicit opt-in", () => {
  for (const name of ["waltajjii", "production", "waltajjii-live", "mydatabase"]) {
    assert.throws(() => assertDisposablePostgresDatabaseUrl(
      "postgresql://user:password@localhost:5432/" + name, "1"
    ), /Refusing to run destructive integration migrations/);
  }
});

test("refuses missing opt-in, missing URL, and non-PostgreSQL URLs", () => {
  assert.throws(() => assertDisposablePostgresDatabaseUrl(
    "postgresql://user:password@localhost:5432/waltajjii_test", "0"
  ), /ALLOW_DISPOSABLE_POSTGRES_TESTS=1/);
  assert.throws(() => assertDisposablePostgresDatabaseUrl("", "1"), /TEST_DATABASE_URL/);
  assert.throws(() => assertDisposablePostgresDatabaseUrl(
    "sqlite:///tmp/waltajjii_test.db", "1"
  ), /must use PostgreSQL/);
});
