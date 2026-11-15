"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("PostgreSQL adapter exposes a transaction-scoped query interface", () => {
  const source = fs.readFileSync(path.join(root, "src/db/postgres-adapter.js"), "utf8");
  assert.match(source, /async function withTransaction\(work\)/);
  assert.match(source, /await client\.query\("BEGIN"\)/);
  assert.match(source, /await client\.query\("COMMIT"\)/);
  assert.match(source, /await client\.query\("ROLLBACK"\)/);
});

test("production server remains explicitly on the existing SQLite composition", () => {
  const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
  const adapter = fs.readFileSync(path.join(root, "src/db/postgres-adapter.js"), "utf8");
  assert.match(server, /require\("\.\/db"\)/);
  assert.match(adapter, /deliberately NOT wired into the running app yet/);
  assert.doesNotMatch(server, /createPostgresApiRouter/);
});

test("phase 96 documentation forbids production cutover without staging sign-off", () => {
  const doc = fs.readFileSync(path.join(root, "PHASE-96-STAGING-INTEGRATION-AND-RELEASE-SAFETY.md"), "utf8");
  assert.match(doc, /isolated staging service and isolated database/);
  assert.match(doc, /does \*\*not\*\* switch the app to PostgreSQL/);
  assert.match(doc, /No Render configuration, deployment, environment variable, Supabase project/);
});
