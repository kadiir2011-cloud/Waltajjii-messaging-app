"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPostgresRealtimeService } = require("../src/services/postgres-realtime-service");
const { attachPostgresRealtime } = require("../src/postgres/postgres-realtime-socket");

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


class MockIO {
  constructor() {
    this.middleware = null;
    this.connectionHandler = null;
    this.clients = new Map();
    this.rooms = new Map();
    this.sockets = { adapter: { rooms: this.rooms } };
  }
  use(fn) { this.middleware = fn; }
  on(event, fn) { if (event === "connection") this.connectionHandler = fn; }
  addToRoom(socket, room) {
    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room).add(socket);
  }
  removeFromRoom(socket, room) {
    const members = this.rooms.get(room);
    if (!members) return;
    members.delete(socket);
    if (!members.size) this.rooms.delete(room);
  }
  to(room) {
    return { emit: (event, payload) => {
      for (const socket of this.rooms.get(room) || []) socket.receive(event, payload);
    }};
  }
  in(room) {
    return { socketsLeave: target => {
      for (const socket of Array.from(this.rooms.get(room) || [])) {
        this.removeFromRoom(socket, target);
      }
    }};
  }
  emit(event, payload) {
    for (const socket of this.clients.values()) socket.receive(event, payload);
  }
  async connect(userId, username) {
    const socket = new MockSocket(this, String(userId), username);
    this.clients.set(socket.id, socket);
    await new Promise((resolve, reject) => this.middleware(
      socket, error => error ? reject(error) : resolve()
    ));
    await this.connectionHandler(socket);
    return socket;
  }
}
class MockSocket {
  constructor(io, userId, username) {
    this.io = io;
    this.id = "socket-" + userId;
    this.data = { userId, username };
    this.handshake = { auth: { token: userId } };
    this.handlers = new Map();
    this.outbox = [];
    this.io.addToRoom(this, this.id);
  }
  on(event, handler) { this.handlers.set(event, handler); }
  emit(event, payload) { this.receive(event, payload); }
  receive(event, payload) { this.outbox.push({ event, payload }); }
  async join(room) { this.io.addToRoom(this, room); }
  async leave(room) { this.io.removeFromRoom(this, room); }
  to(room) {
    return { emit: (event, payload) => {
      for (const socket of this.io.rooms.get(room) || []) {
        if (socket !== this) socket.receive(event, payload);
      }
    }};
  }
  async trigger(event, payload = {}) {
    const handler = this.handlers.get(event);
    assert.ok(handler, "No handler registered for " + event);
    let acknowledgement;
    await handler(payload, value => { acknowledgement = value; });
    return acknowledgement;
  }
}

test("two authenticated sockets can complete authorized direct-call recovery", async () => {
  const io = new MockIO();
  attachPostgresRealtime(io, {
    jwt: { verify: token => ({ userId: token, username: "user" + token }) },
    jwtSecret: "s".repeat(40),
    realtimeService: {
      listGroupIdsForUser: async () => [],
      isGroupMember: async () => false,
      getGroupMemberRole: async () => null,
      markMessageDelivered: async () => null
    }
  });
  const caller = await io.connect("11", "caller");
  const recipient = await io.connect("22", "recipient");
  assert.deepEqual(await caller.trigger("call:offer", {
    targetUserId: "22", offer: { type: "offer", sdp: "offer-sdp" }
  }), { ok: true });
  assert.deepEqual(await caller.trigger("call:recovery-request", { targetUserId: "22" }), { ok: true });
  assert.ok(recipient.outbox.some(item => item.event === "call:recovery-requested"));
  assert.deepEqual(await caller.trigger("call:recovery-offer", {
    targetUserId: "22", offer: { type: "offer", sdp: "recovery-sdp" }
  }), { ok: true });
  assert.deepEqual(await recipient.trigger("call:recovery-answer", {
    targetUserId: "11", answer: { type: "answer", sdp: "answer-sdp" }
  }), { ok: true });
  assert.ok(caller.outbox.some(item => item.event === "call:recovery-answer"));
  assert.deepEqual(await caller.trigger("call:recovery-request", { targetUserId: "33" }), {
    ok: false, error: "There is no active call to recover."
  });
});

test("group-call lifecycle enforces membership, relays peer signaling, and restricts moderation", async () => {
  const roles = new Map([["11", "admin"], ["22", "member"]]);
  const members = new Set(["11", "22"]);
  const io = new MockIO();
  attachPostgresRealtime(io, {
    jwt: { verify: token => ({ userId: token, username: "user" + token }) },
    jwtSecret: "s".repeat(40),
    realtimeService: {
      listGroupIdsForUser: async userId => members.has(userId) ? ["5"] : [],
      isGroupMember: async (_groupId, userId) => members.has(userId),
      getGroupMemberRole: async (_groupId, userId) => roles.get(userId) || null,
      markMessageDelivered: async () => null
    }
  });
  const host = await io.connect("11", "host");
  const member = await io.connect("22", "member");
  const outsider = await io.connect("33", "outsider");
  assert.deepEqual(await host.trigger("group-call:start", { groupId: "5" }), {
    ok: true, groupId: "5", participants: [{ userId: "11", username: "host" }]
  });
  assert.deepEqual(await member.trigger("group-call:join", { groupId: "5" }).then(value => ({
    ok: value.ok, groupId: value.groupId
  })), { ok: true, groupId: "5" });
  assert.deepEqual(await outsider.trigger("group-call:join", { groupId: "5" }), {
    ok: false, error: "No active group call is available to you."
  });
  assert.deepEqual(await host.trigger("group-call:offer", {
    groupId: "5", targetUserId: "22", description: { type: "offer", sdp: "group-offer" }
  }), { ok: true });
  assert.ok(member.outbox.some(item => item.event === "group-call:offer"));
  assert.deepEqual(await member.trigger("group-call:hand-raise", {
    groupId: "5", raised: true
  }), { ok: true, raised: true });
  assert.deepEqual(await host.trigger("group-call:moderate", {
    groupId: "5", targetUserId: "22", action: "request-mute"
  }), { ok: true, action: "request-mute", targetUserId: "22" });
  assert.deepEqual(await member.trigger("group-call:end", { groupId: "5" }), {
    ok: false, error: "Only the group-call host can end this call for everyone."
  });
  assert.deepEqual(await host.trigger("group-call:end", { groupId: "5" }), { ok: true });
  assert.ok(member.outbox.some(item => item.event === "group-call:ended"));
});

test("a non-admin participant cannot moderate another group-call participant", async () => {
  const io = new MockIO();
  attachPostgresRealtime(io, {
    jwt: { verify: token => ({ userId: token, username: "user" + token }) },
    jwtSecret: "s".repeat(40),
    realtimeService: {
      listGroupIdsForUser: async () => ["9"],
      isGroupMember: async () => true,
      getGroupMemberRole: async () => "member",
      markMessageDelivered: async () => null
    }
  });
  const participantA = await io.connect("41", "a");
  const participantB = await io.connect("42", "b");
  await participantA.trigger("group-call:start", { groupId: "9" });
  await participantB.trigger("group-call:join", { groupId: "9" });
  assert.deepEqual(await participantB.trigger("group-call:moderate", {
    groupId: "9", targetUserId: "41", action: "remove"
  }), {
    ok: false, error: "Only the call host or a group admin can moderate participants."
  });
});
