"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const root = path.join(__dirname, "..");
const sqliteDbSource = fs.readFileSync(path.join(root, "src/db.js"), "utf8");
const sqliteAuthSource = fs.readFileSync(path.join(root, "src/routes/auth.js"), "utf8");
const postgresAuthSource = fs.readFileSync(path.join(root, "src/services/postgres-auth-service.js"), "utf8");
const postgresSchema = fs.readFileSync(path.join(root, "migrations/postgres/001_initial_schema.sql"), "utf8");
const preflightSource = fs.readFileSync(path.join(root, "scripts/phase57-sqlite-migration-preflight.js"), "utf8");

test("Phase 62: SQLite and PostgreSQL declare the same case-insensitive username identity rule", () => {
  assert.match(sqliteDbSource, /username TEXT NOT NULL COLLATE NOCASE UNIQUE/);
  assert.match(sqliteAuthSource, /WHERE username = \?/);
  assert.match(postgresSchema, /CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users \\(LOWER\\(username\\)\\)/);
  assert.match(postgresAuthSource, /WHERE LOWER\\(username\\) = LOWER\\(\\$1\\)/);
  assert.match(preflightSource, /GROUP BY username COLLATE NOCASE HAVING COUNT\\(\\*\\)>1/);
});

test("Phase 62: SQLite username equality, uniqueness and login lookup are case-insensitive", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL)");
    db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run("Alice", "hash");
    const found = db.prepare("SELECT username FROM users WHERE username = ?").get("ALICE");
    assert.equal(found.username, "Alice");
    assert.throws(
      () => db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run("alice", "another"),
      error => error.code === "SQLITE_CONSTRAINT_UNIQUE"
    );
  } finally {
    db.close();
  }
});

test("Phase 62: both auth implementations trim input and restrict usernames to the same ASCII grammar", () => {
  const grammar = /^[a-zA-Z0-9_]{3,30}$/;
  for (const candidate of ["alice", "Alice_01", "abc123"]) assert.equal(grammar.test(candidate.trim()), true);
  for (const candidate of ["ab", "a b", "éclair", "alice!", "a".repeat(31), ""]) {
    assert.equal(grammar.test(candidate.trim()), false, candidate);
  }
  assert.match(sqliteAuthSource, /String\\(req\\.body\\.username \\|\\| ""\\)\\.trim\\(\\)/);
  assert.match(postgresAuthSource, /String\\(rawUsername \\|\\| ""\\)\\.trim\\(\\)/);
  assert.match(sqliteAuthSource, /a-zA-Z0-9_/);
  assert.match(postgresAuthSource, /a-zA-Z0-9_/);
});

test("Phase 62: preflight blocks legacy case-insensitive username collisions before migration", () => {
  assert.match(preflightSource, /caseInsensitiveDuplicateGroups/);
  assert.match(preflightSource, /Found case-insensitive duplicate username group/);
});
