"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

test("the active server remains explicitly on the established SQLite route composition", () => {
  const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
  assert.match(server, /require\("\.\/db"\)/);
  for (const route of ["auth", "messages", "groups", "channels", "uploads", "social", "moments", "calls"]) {
    assert.ok(server.includes('require("./routes/' + route + '")'), "missing active SQLite route: " + route);
  }
  assert.doesNotMatch(server, /createPostgresApiRouter/);
});

test("the PostgreSQL API composition remains opt-in and declares all major API domains", () => {
  const router = fs.readFileSync(path.join(root, "src/postgres/postgres-api-router.js"), "utf8");
  for (const route of [
    "createPostgresAuthRouter", "createPostgresMessagesRouter", "createPostgresGroupsRouter",
    "createPostgresGroupGovernanceRouter", "createPostgresChannelsRouter",
    "createPostgresSocialRouter", "createPostgresMomentsRouter",
    "createPostgresPresenceRouter", "createPostgresUploadsRouter",
    "createPostgresCallsRouter", "createPostgresTranslationRouter",
    "createPostgresAiAssistantRouter", "createPostgresAudioIntelligenceRouter"
  ]) assert.ok(router.includes(route), "missing PostgreSQL route composition: " + route);
  assert.match(router, /Opt-in PostgreSQL API composition/);
});

test("the active server has synchronous SQLite access in realtime and must not be switched prematurely", () => {
  const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
  assert.match(server, /db\.prepare\(/);
  assert.match(server, /io\.on\("connection"/);
  assert.match(server, /group_members/);
  assert.match(server, /message:delivered/);
});

test("the PostgreSQL realtime implementation is separately composed, not imported by active server", () => {
  const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
  const realtime = fs.readFileSync(path.join(root, "src/postgres/postgres-realtime-server.js"), "utf8");
  assert.doesNotMatch(server, /createPostgresRealtimeServer/);
  assert.match(realtime, /Opt-in PostgreSQL Socket\.IO composition/);
});

test("the migration map explicitly requires isolated staging and separate production approval", () => {
  const doc = fs.readFileSync(path.join(root, "PHASE-97-POSTGRES-RUNTIME-MIGRATION-MAP.md"), "utf8");
  assert.match(doc, /isolated PostgreSQL database/);
  assert.match(doc, /production cutover \(separate approval\)/);
  assert.match(doc, /Keep the existing SQLite production server and Render deployment unchanged/);
});
