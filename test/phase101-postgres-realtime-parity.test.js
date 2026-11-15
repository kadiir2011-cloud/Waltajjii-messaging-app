"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPostgresRealtimeService } = require("../src/services/postgres-realtime-service");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const postgresSocket = read("src/postgres/postgres-realtime-socket.js");

function registeredEvents(source) {
  return [...source.matchAll(/socket\.on\(\s*["'\x60]([^"'\x60]+)["'\x60]/g)].map(match => match[1]);
}

test("PostgreSQL realtime registers direct-call recovery and all group-call lifecycle events", () => {
  const names = registeredEvents(postgresSocket);
  for (const name of [
    "call:recovery-request", "call:recovery-offer", "call:recovery-answer",
    "group-call:start", "group-call:status", "group-call:join",
    "group-call:hand-raise", "group-call:moderate", "group-call:leave", "group-call:end"
  ]) assert.ok(names.includes(name), "Missing realtime event " + name);
});

test("group-call peer signaling is registered for offer, answer, and ICE candidate", () => {
  assert.match(postgresSocket, /for \(const eventName of \["group-call:offer", "group-call:answer", "group-call:ice-candidate"\]\)/);
  assert.match(postgresSocket, /call\.participants\.has\(userId\)/);
  assert.match(postgresSocket, /call\.participants\.has\(target\)/);
  assert.match(postgresSocket, /realtimeService\.isGroupMember\(groupId, target\)/);
});

test("group-call state is shared across socket connections, not allocated per connection", () => {
  const outerMaps = postgresSocket.indexOf("const activeGroupCalls = new Map();");
  const connection = postgresSocket.indexOf('io.on("connection"');
  assert.ok(outerMaps >= 0 && outerMaps < connection);
  assert.ok(postgresSocket.indexOf("const activeGroupCallByUser = new Map();") < connection);
});

test("moderation requires host or current group admin and validates action", () => {
  assert.match(postgresSocket, /realtimeService\.getGroupMemberRole\(groupId, userId\)/);
  assert.match(postgresSocket, /call\.hostId === userId \|\| role === "admin"/);
  assert.match(postgresSocket, /\["remove", "lower-hand", "request-mute"\]/);
  assert.match(postgresSocket, /target === call\.hostId/);
});

test("group-call start and join verify current membership and enforce participant limit", () => {
  assert.match(postgresSocket, /await currentGroupMember\(groupId\)/);
  assert.match(postgresSocket, /call\.participants\.size >= 8/);
  assert.match(postgresSocket, /activeCalls\.has\(userId\)/);
  assert.match(postgresSocket, /activeGroupCallByUser\.has\(userId\)/);
});

test("group-call disconnect cleanup and host termination release call state", () => {
  assert.match(postgresSocket, /for \(const groupId of Array\.from\(groupCallMembership\)\)/);
  assert.match(postgresSocket, /activeGroupCalls\.delete\(groupId\)/);
  assert.match(postgresSocket, /socketsLeave\("group-call:" \+ groupId\)/);
});

test("PostgreSQL realtime service retrieves current group member role from database", async () => {
  let query;
  const service = createPostgresRealtimeService({
    db: {
      one: async (sql, params) => { query = { sql, params }; return { role: "admin" }; },
      many: async () => [],
      execute: async () => ({ rowCount: 0 })
    }
  });
  assert.equal(await service.getGroupMemberRole("12", "34"), "admin");
  assert.match(query.sql, /SELECT role FROM group_members/);
  assert.deepEqual(query.params, ["12", "34"]);
});

test("group member role lookup returns null when membership is absent", async () => {
  const service = createPostgresRealtimeService({
    db: {
      one: async () => null,
      many: async () => [],
      execute: async () => ({ rowCount: 0 })
    }
  });
  assert.equal(await service.getGroupMemberRole("12", "34"), null);
});
