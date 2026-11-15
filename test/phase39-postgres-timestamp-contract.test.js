const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("all timestamp declarations in PostgreSQL DDL use TIMESTAMPTZ", () => {
  const ddl = read("migrations/postgres/001_initial_schema.sql");
  const timestampNames = new Set([
    "created_at", "updated_at", "joined_at", "delivered_at", "read_at",
    "edited_at", "deleted_at", "pinned_at", "expires_at", "revoked_at",
    "hidden_at", "reviewed_at", "closed_at", "starts_at", "cancelled_at"
  ]);
  const declarations = ddl.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .filter((line) => timestampNames.has(line.split(/\s+/)[0]));
  assert.ok(declarations.length >= 30, "expected to inspect timestamp declarations across the schema");
  for (const line of declarations) {
    assert.match(line, /^[a-z_]+\s+TIMESTAMPTZ\b/, line);
  }
});

test("SQLite-generated creation and expiry timestamps are UTC-based", () => {
  const sqlite = read("src/db.js");
  assert.match(sqlite, /DEFAULT CURRENT_TIMESTAMP/);
  assert.match(sqlite, /datetime\('now', '\+24 hours'\)/);
});

test("group event input requires an explicit offset and stores normalized UTC ISO", () => {
  const groups = read("src/routes/groups.js");
  assert.ok(groups.includes("!/(Z|[+-]\\d{2}:?\\d{2})$/i.test(startsAt)"));
  assert.match(groups, /startDate\.toISOString\(\)/);
});

test("group invitation expiry is stored as an offset-bearing ISO instant", () => {
  const groups = read("src/routes/groups.js");
  assert.match(groups, /new Date\(Date\.now\(\) \+ duration \* 60 \* 60 \* 1000\)\.toISOString\(\)/);
});

test("reminder worker's SQLite-only date arithmetic remains identified for conversion", () => {
  const server = read("src/server.js");
  assert.match(server, /julianday\(e\.starts_at\)/);
  assert.match(server, /INSERT OR IGNORE INTO group_event_reminder_deliveries/);
  assert.match(server, /db\.transaction\(\(event\) =>/);
});
