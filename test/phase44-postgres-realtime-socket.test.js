"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { attachPostgresRealtime } = require("../src/postgres/postgres-realtime-socket");

const secret = "phase44-test-secret-with-at-least-32-characters";
function makeHarness(serviceOverrides = {}) {
  const middlewares = [];
  const handlers = {};
  const emitted = [];
  const rooms = new Map();
  const io = {
    sockets: { adapter: { rooms } },
    use(fn) { middlewares.push(fn); },
    on(event, fn) { handlers[event] = fn; },
    emit(event, payload) { emitted.push({ room: "*", event, payload }); },
    to(room) { return { emit(event, payload) { emitted.push({ room, event, payload }); } }; }
  };
  const service = {
    async listGroupIdsForUser() { return ["55"]; },
    async isGroupMember(groupId, userId) { return groupId === "55" && userId === "7"; },
    async markMessageDelivered(messageId, recipientId) {
      return { messageId, senderId: "3", receiverId: recipientId, readAt: null };
    },
    ...serviceOverrides
  };
  const realtime = attachPostgresRealtime(io, { jwt, jwtSecret: secret, realtimeService: service });
  function makeSocket(userId, username) {
    const socketEvents = {};
    const socketEmitted = [];
    const socket = {
      handshake: { auth: { token: jwt.sign({ userId, username }, secret, {
        expiresIn: "1h", issuer: "waltajjii", audience: "waltajjii-users"
      }) } },
      data: {},
      on(event, fn) { socketEvents[event] = fn; },
      emit(event, payload) { socketEmitted.push({ event, payload }); },
      async join(room) {
        let set = rooms.get(room);
        if (!set) rooms.set(room, set = new Set());
        set.add(socket);
      },
      to(room) { return { emit(event, payload) { emitted.push({ room, event, payload }); } }; },
      events: socketEvents,
      outgoing: socketEmitted
    };
    return socket;
  }
  return { io, middlewares, handlers, emitted, rooms, service, realtime, makeSocket };
}
function runMiddleware(middleware, socket) {
  return new Promise(resolve => middleware(socket, error => resolve(error || null)));
}

test("requires explicit dependencies and authenticates JWT claims", async () => {
  assert.throws(() => attachPostgresRealtime({}, {}), /Socket.IO server/);
  const h = makeHarness();
  const missing = { handshake: { auth: {} }, data: {} };
  assert.match((await runMiddleware(h.middlewares[0], missing)).message, /Authentication required/);
  const invalid = { handshake: { auth: { token: "bad" } }, data: {} };
  assert.match((await runMiddleware(h.middlewares[0], invalid)).message, /Invalid or expired/);
  const valid = h.makeSocket("7", "member");
  assert.equal(await runMiddleware(h.middlewares[0], valid), null);
  assert.equal(valid.data.userId, "7");
  assert.equal(valid.data.username, "member");
});

test("connection publishes presence, joins user and PostgreSQL group rooms", async () => {
  const h = makeHarness();
  const socket = h.makeSocket("7", "member");
  await runMiddleware(h.middlewares[0], socket);
  await h.handlers.connection(socket);
  assert.deepEqual(h.realtime.getOnlineUserIds(), ["7"]);
  assert.ok(h.rooms.get("user:7").has(socket));
  assert.ok(h.rooms.get("group:55").has(socket));
  assert.ok(socket.outgoing.some(item => item.event === "presence:snapshot"));
  assert.ok(h.emitted.some(item => item.event === "presence:update" && item.payload.online === true));
});

test("presence remains online until the last session disconnects", async () => {
  const h = makeHarness();
  const a = h.makeSocket("7", "member"), b = h.makeSocket("7", "member");
  for (const socket of [a,b]) {
    await runMiddleware(h.middlewares[0], socket);
    await h.handlers.connection(socket);
  }
  assert.equal(h.rooms.get("user:7").size, 2);
  h.rooms.get("user:7").delete(a);
  a.events.disconnect();
  assert.deepEqual(h.realtime.getOnlineUserIds(), ["7"]);
  h.rooms.get("user:7").delete(b);
  b.events.disconnect();
  assert.deepEqual(h.realtime.getOnlineUserIds(), []);
  assert.ok(h.emitted.some(item => item.event === "presence:update" && item.payload.online === false));
});

test("group typing requires PostgreSQL membership and acknowledges success", async () => {
  const h = makeHarness();
  const socket = h.makeSocket("7", "member");
  await runMiddleware(h.middlewares[0], socket);
  await h.handlers.connection(socket);
  let ack;
  await socket.events["group:typing:start"]({ groupId: "55" }, value => { ack = value; });
  assert.deepEqual(ack, { ok: true });
  await socket.events["group:typing:start"]({ groupId: "56" }, value => { ack = value; });
  assert.deepEqual(ack, { ok: false, error: "You are not a member of this group." });
  await socket.events["group:typing:start"]({ groupId: "1e3" }, value => { ack = value; });
  assert.deepEqual(ack, { ok: false, error: "Invalid group." });
});

test("message delivery is persisted for the authenticated recipient before notifying sender", async () => {
  const h = makeHarness();
  const socket = h.makeSocket("4", "recipient");
  await runMiddleware(h.middlewares[0], socket);
  await h.handlers.connection(socket);
  let ack;
  await socket.events["message:delivered"]({ messageId: "12" }, value => { ack = value; });
  assert.deepEqual(ack, { ok: true });
  assert.ok(h.emitted.some(item => item.room === "user:3" &&
    item.event === "message:status" && item.payload.status === "delivered"));
  await socket.events["message:delivered"]({ messageId: "12x" }, value => { ack = value; });
  assert.deepEqual(ack, { ok: false, error: "Invalid message." });
});

test("call signaling only forwards within an authorized paired call", async () => {
  const h = makeHarness();
  const caller = h.makeSocket("7", "caller"), recipient = h.makeSocket("8", "recipient");
  for (const socket of [caller,recipient]) {
    await runMiddleware(h.middlewares[0], socket);
    await h.handlers.connection(socket);
  }
  let ack;
  await caller.events["call:offer"]({ targetUserId: "8", offer: { type: "offer" } }, value => { ack = value; });
  assert.deepEqual(ack, { ok: true });
  assert.ok(h.emitted.some(item => item.room === "user:8" && item.event === "call:incoming"));
  await recipient.events["call:answer"]({ targetUserId: "7", answer: { type: "answer" } }, value => { ack = value; });
  assert.deepEqual(ack, { ok: true });
  recipient.events["call:ice-candidate"]({ targetUserId: "7", candidate: { candidate: "x" } });
  assert.ok(h.emitted.some(item => item.room === "user:7" && item.event === "call:ice-candidate"));
  recipient.events["call:end"]({ targetUserId: "7" });
  assert.ok(h.emitted.some(item => item.room === "user:7" && item.event === "call:ended"));
});

test("database failures return safe acknowledgements", async () => {
  const h = makeHarness({ async markMessageDelivered() { throw new Error("private database detail"); } });
  const socket = h.makeSocket("4", "recipient");
  await runMiddleware(h.middlewares[0], socket);
  await h.handlers.connection(socket);
  let ack;
  await socket.events["message:delivered"]({ messageId: "12" }, value => { ack = value; });
  assert.deepEqual(ack, { ok: false, error: "Could not update message delivery." });
});
