"use strict";

function assertDisposablePostgresDatabaseUrl(connectionString, allowFlag) {
  if (allowFlag !== "1") {
    throw new Error("Set ALLOW_DISPOSABLE_POSTGRES_TESTS=1 only for a disposable PostgreSQL database.");
  }
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL.");
  }
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!/(^|[-_])(staging|stage|test|preview)([-_]|$)/i.test(databaseName)) {
    throw new Error("Refusing to run destructive integration migrations without a staging/test/preview database name.");
  }
  return connectionString;
}

module.exports = { assertDisposablePostgresDatabaseUrl };
