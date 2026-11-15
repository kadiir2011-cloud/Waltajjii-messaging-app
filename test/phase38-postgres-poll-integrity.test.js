"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ddlPath = path.join(__dirname, "..", "migrations", "postgres", "001_initial_schema.sql");
const ddl = fs.readFileSync(ddlPath, "utf8");

function tableDefinition(name) {
  const start = ddl.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
  assert.notEqual(start, -1, `Missing table definition: ${name}`);
  const end = ddl.indexOf("\n);", start);
  assert.notEqual(end, -1, `Could not locate end of table definition: ${name}`);
  return ddl.slice(start, end + 3);
}

test("poll options expose a unique (poll_id, id) key for composite references", () => {
  const options = tableDefinition("group_poll_options");
  assert.match(options, /CONSTRAINT group_poll_options_poll_id_id_uq UNIQUE\s*\(poll_id\s*,\s*id\)/i);
});

test("poll votes enforce that the selected option belongs to the same poll", () => {
  const votes = tableDefinition("group_poll_votes");
  assert.match(votes, /CONSTRAINT group_poll_votes_option_same_poll_fk\s+FOREIGN KEY\s*\(poll_id\s*,\s*option_id\)\s+REFERENCES\s+group_poll_options\s*\(poll_id\s*,\s*id\)\s+ON DELETE CASCADE/i);
});

test("poll votes no longer have an independent option_id foreign key", () => {
  const votes = tableDefinition("group_poll_votes");
  assert.doesNotMatch(votes, /option_id\s+BIGINT\s+NOT NULL\s+REFERENCES\s+group_poll_options\s*\(id\)/i);
});

test("poll deletion still cascades through options and votes", () => {
  const options = tableDefinition("group_poll_options");
  const votes = tableDefinition("group_poll_votes");
  assert.match(options, /poll_id\s+BIGINT\s+NOT NULL\s+REFERENCES\s+group_polls\s*\(id\)\s+ON DELETE CASCADE/i);
  assert.match(votes, /FOREIGN KEY\s*\(poll_id\s*,\s*option_id\)[\s\S]*?ON DELETE CASCADE/i);
});

test("draft migration remains transaction-wrapped and is not executed by this test", () => {
  assert.match(ddl.trim(), /^--[\s\S]*?BEGIN;/);
  assert.match(ddl.trim(), /COMMIT;$/);
});
