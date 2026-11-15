"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
function source(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}
function routes(file) {
  return [...source(file).matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*["'\x60]([^"'\x60]+)["'\x60]/g)]
    .map(match => match[1].toUpperCase() + " " + match[2]);
}
function events(file) {
  return [...source(file).matchAll(/socket\.on\(\s*["'\x60]([^"'\x60]+)["'\x60]/g)]
    .map(match => match[1]);
}
function missing(left, right) {
  return left.filter(item => !right.includes(item));
}

test("PostgreSQL HTTP routes preserve core SQLite route contracts", () => {
  const pairs = [
    ["src/routes/auth.js", ["src/routes/postgres-auth.js"]],
    ["src/routes/messages.js", ["src/routes/postgres-messages.js"]],
    ["src/routes/groups.js", ["src/routes/postgres-groups.js", "src/routes/postgres-group-governance.js"]],
    ["src/routes/channels.js", ["src/routes/postgres-channels.js"]],
    ["src/routes/social.js", ["src/routes/postgres-social.js"]],
    ["src/routes/moments.js", ["src/routes/postgres-moments.js"]],
    ["src/routes/calls.js", ["src/routes/postgres-calls.js"]]
  ];
  for (const [sqliteFile, postgresFiles] of pairs) {
    const postgresRoutes = postgresFiles.flatMap(routes);
    assert.deepEqual(
      missing(routes(sqliteFile), postgresRoutes),
      [],
      "PostgreSQL route parity gap for " + sqliteFile
    );
  }
});

test("PostgreSQL channels retain all SQLite routes and expose read/delivery/reaction extensions", () => {
  const sqlite = routes("src/routes/channels.js");
  const postgres = routes("src/routes/postgres-channels.js");
  assert.deepEqual(missing(sqlite, postgres), []);
  for (const extension of [
    "POST /:id/messages/:messageId/delivered",
    "POST /:id/messages/:messageId/read",
    "POST /:id/messages/:messageId/reactions",
    "PATCH /:id/messages/:messageId",
    "DELETE /:id/messages/:messageId",
    "PUT /:id/messages/:messageId/pin"
  ]) assert.ok(postgres.includes(extension), "Missing PostgreSQL channel extension: " + extension);
});

test("upload media retrieval uses an explicitly reviewed identifier migration", () => {
  const sqlite = routes("src/routes/uploads.js");
  const postgres = routes("src/routes/postgres-uploads.js");
  assert.ok(sqlite.includes("GET /:filename"));
  assert.ok(postgres.includes("GET /:mediaId"));
  assert.ok(!postgres.includes("GET /:filename"));
  assert.ok(postgres.includes("GET /profile-picture/:userId"));
  assert.ok(postgres.includes("GET /:mediaId"));
});

test("PostgreSQL API composition mounts every opt-in route domain", () => {
  const api = source("src/postgres/postgres-api-router.js");
  for (const prefix of [
    "/auth", "/messages", "/groups", "/channels", "/social",
    "/moments", "/presence", "/uploads", "/calls",
    "/translation", "/ai", "/audio"
  ]) assert.ok(api.includes('router.use("' + prefix + '"'), "Missing API mount: " + prefix);
});

test("realtime parity audit records the exact live events still missing from PostgreSQL", () => {
  const liveEvents = events("src/server.js");
  const postgresEvents = events("src/postgres/postgres-realtime-socket.js");
  const knownGaps = [
    "call:recovery-request",
    "call:recovery-offer",
    "call:recovery-answer",
    "group-call:start",
    "group-call:status",
    "group-call:join",
    "group-call:hand-raise",
    "group-call:moderate",
    "group-call:leave",
    "group-call:end"
  ];
  assert.deepEqual(missing(liveEvents, postgresEvents).sort(), knownGaps.sort());
  assert.ok(postgresEvents.includes("call:caption"));
  assert.ok(!liveEvents.includes("call:caption"));
});

test("active production entrypoint remains on the SQLite runtime", () => {
  const server = source("src/server.js");
  assert.match(server, /require\(["']\.\/db["']\)/);
  assert.doesNotMatch(server, /createPostgresStagingRuntime|createPostgresApiRouter|createPostgresRealtimeServer/);
});
