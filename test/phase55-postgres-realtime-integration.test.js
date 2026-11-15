"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { io: createClient } = require("socket.io-client");
const { createPostgresAdapter } = require("../src/db/postgres-adapter");
const { createPostgresRealtimeService } = require("../src/services/postgres-realtime-service");
const { createPostgresRealtimeServer } = require("../src/postgres/postgres-realtime-server");

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL.");
if (process.env.ALLOW_DISPOSABLE_POSTGRES_TESTS !== "1") {
  throw new Error("Set ALLOW_DISPOSABLE_POSTGRES_TESTS=1 only for a disposable PostgreSQL database.");
}
let disposableDatabaseName = "";
try {
  const parsedDatabaseUrl = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }
  disposableDatabaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
} catch {
  throw new Error("TEST_DATABASE_URL is invalid.");
}
if (!/(^|[-_])(staging|stage|test|preview)([-_]|$)/i.test(disposableDatabaseName)) {
  throw new Error("Refusing to run destructive integration migrations without a staging/test/preview database name.");
}
const secret = "phase55-disposable-integration-secret-at-least-32-characters";
const pool = new Pool({ connectionString, max: 5, options: "-c search_path=waltajjii,public" });
const db = createPostgresAdapter(pool);
const clients = new Set();
let server, ioServer;
let seededUserIds = [];

function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error("Timed out waiting for Socket.IO event: " + event));
    }, timeoutMs);
    function onEvent(...args) {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(args);
    }
    socket.on(event, onEvent);
  });
}
function connectClient(url, token) {
  const socket = createClient(url, { autoConnect: false, reconnection: false, timeout: 4000,
    transports: ["websocket"], auth: { token } });
  clients.add(socket);
  const connected = waitFor(socket, "connect");
  socket.connect();
  return connected.then(() => socket);
}
function tokenFor(user) {
  return jwt.sign({ userId: String(user.id), username: user.username }, secret,
    { expiresIn: "1h", issuer: "waltajjii", audience: "waltajjii-users" });
}
function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("No acknowledgement for " + event)), 5000);
    socket.emit(event, payload, response => { clearTimeout(timer); resolve(response); });
  });
}

test("Phase 55: real Socket.IO clients use PostgreSQL-backed presence, rooms, receipts and calls", async () => {
  const root = path.join(__dirname, "..");
  for (const migration of ["001_initial_schema.sql", "002_channel_message_interactions.sql", "003_media_objects.sql"]) {
    await pool.query(fs.readFileSync(path.join(root, "migrations/postgres", migration), "utf8"));
  }

  const suffix = Date.now().toString();
  const users = [];
  for (const name of ["alice", "bob", "outsider"]) {
    const row = await db.one("INSERT INTO users(username,password_hash) VALUES($1,'test-hash') RETURNING id,username",
      ["p55_" + name + "_" + suffix]);
    users.push(row);
    seededUserIds.push(String(row.id));
  }
  const [alice, bob, outsider] = users;
  const group = await db.one("INSERT INTO groups(name,created_by) VALUES($1,$2) RETURNING id",
    ["Phase 55 group " + suffix, String(alice.id)]);
  await db.execute("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'admin'),($1,$3,'member')",
    [String(group.id), String(alice.id), String(bob.id)]);
  const message = await db.one("INSERT INTO messages(sender_id,receiver_id,body) VALUES($1,$2,'Phase 55 receipt test') RETURNING id",
    [String(alice.id), String(bob.id)]);

  const app = express();
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  server = http.createServer(app);
  const realtimeService = createPostgresRealtimeService({ db });
  const realtimeServer = createPostgresRealtimeServer(server, {
    jwt, jwtSecret: secret, realtimeService, socketOptions: { cors: { origin: false } }
  });
  ioServer = realtimeServer.io;
  const realtimeState = realtimeServer;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;

  const aliceSocket = await connectClient(url, tokenFor(alice));
  const bobSocket = await connectClient(url, tokenFor(bob));
  const outsiderSocket = await connectClient(url, tokenFor(outsider));
  assert.ok(realtimeState.getOnlineUserIds().includes(String(alice.id)));
  assert.ok(realtimeState.getOnlineUserIds().includes(String(bob.id)));

  const directTyping = waitFor(bobSocket, "typing:update");
  aliceSocket.emit("typing:start", { targetUserId: String(bob.id) });
  const [typingPayload] = await directTyping;
  assert.equal(typingPayload.userId, String(alice.id));
  assert.equal(typingPayload.isTyping, true);

  const groupTyping = waitFor(bobSocket, "group:typing:update");
  const groupAck = await emitAck(aliceSocket, "group:typing:start", { groupId: String(group.id) });
  assert.equal(groupAck.ok, true);
  const [groupPayload] = await groupTyping;
  assert.equal(groupPayload.groupId, String(group.id));
  assert.equal(groupPayload.userId, String(alice.id));
  const outsiderAck = await emitAck(outsiderSocket, "group:typing:start", { groupId: String(group.id) });
  assert.equal(outsiderAck.ok, false);

  const receiptEvent = waitFor(aliceSocket, "message:status");
  const receiptAck = await emitAck(bobSocket, "message:delivered", { messageId: String(message.id) });
  assert.equal(receiptAck.ok, true);
  const [receipt] = await receiptEvent;
  assert.equal(String(receipt.messageId), String(message.id));
  assert.equal(String(receipt.receiverId), String(bob.id));
  assert.equal(receipt.status, "delivered");
  const persisted = await db.one("SELECT delivered_at FROM messages WHERE id=$1", [String(message.id)]);
  assert.ok(persisted.delivered_at);

  const incomingCall = waitFor(bobSocket, "call:incoming");
  const offerAck = await emitAck(aliceSocket, "call:offer", { targetUserId: String(bob.id),
    offer: { type: "offer", sdp: "phase55-test-offer" } });
  assert.equal(offerAck.ok, true);
  const [offerPayload] = await incomingCall;
  assert.equal(offerPayload.callerId, String(alice.id));
  const acceptedCall = waitFor(aliceSocket, "call:accepted");
  const answerAck = await emitAck(bobSocket, "call:answer", { targetUserId: String(alice.id),
    answer: { type: "answer", sdp: "phase55-test-answer" } });
  assert.equal(answerAck.ok, true);
  const [answerPayload] = await acceptedCall;
  assert.equal(answerPayload.recipientId, String(bob.id));

  // Phase 102: exercise direct-call recovery over real authenticated sockets.
  const recoveryRequested = waitFor(bobSocket, "call:recovery-requested");
  assert.deepEqual(await emitAck(aliceSocket, "call:recovery-request", {
    targetUserId: String(bob.id)
  }), { ok: true });
  const [recoveryRequestPayload] = await recoveryRequested;
  assert.equal(recoveryRequestPayload.senderId, String(alice.id));

  const recoveryOfferEvent = waitFor(bobSocket, "call:recovery-offer");
  assert.deepEqual(await emitAck(aliceSocket, "call:recovery-offer", {
    targetUserId: String(bob.id),
    offer: { type: "offer", sdp: "phase102-recovery-offer" }
  }), { ok: true });
  const [recoveryOfferPayload] = await recoveryOfferEvent;
  assert.equal(recoveryOfferPayload.senderId, String(alice.id));
  assert.equal(recoveryOfferPayload.offer.sdp, "phase102-recovery-offer");

  const recoveryAnswerEvent = waitFor(aliceSocket, "call:recovery-answer");
  assert.deepEqual(await emitAck(bobSocket, "call:recovery-answer", {
    targetUserId: String(alice.id),
    answer: { type: "answer", sdp: "phase102-recovery-answer" }
  }), { ok: true });
  const [recoveryAnswerPayload] = await recoveryAnswerEvent;
  assert.equal(recoveryAnswerPayload.senderId, String(bob.id));
  assert.equal(recoveryAnswerPayload.answer.sdp, "phase102-recovery-answer");

  // End the direct call before starting a group call.
  aliceSocket.emit("call:end", { targetUserId: String(bob.id) });
  await new Promise(resolve => setTimeout(resolve, 100));

  // Phase 102: real PostgreSQL membership checks and group-call signaling.
  const groupAvailable = waitFor(bobSocket, "group-call:available");
  assert.deepEqual(await emitAck(aliceSocket, "group-call:start", {
    groupId: String(group.id)
  }), {
    ok: true,
    groupId: String(group.id),
    participants: [{ userId: String(alice.id), username: alice.username }]
  });
  const [availablePayload] = await groupAvailable;
  assert.equal(availablePayload.groupId, String(group.id));
  assert.equal(availablePayload.hostId, String(alice.id));

  const participantJoined = waitFor(aliceSocket, "group-call:participant-joined");
  const joinedAck = await emitAck(bobSocket, "group-call:join", {
    groupId: String(group.id)
  });
  assert.equal(joinedAck.ok, true);
  assert.equal(joinedAck.groupId, String(group.id));
  const [joinedPayload] = await participantJoined;
  assert.equal(joinedPayload.userId, String(bob.id));

  const outsiderStatus = await emitAck(outsiderSocket, "group-call:status", {
    groupId: String(group.id)
  });
  assert.deepEqual(outsiderStatus, {
    ok: false, error: "You are not a current member of this group."
  });

  const groupOffer = waitFor(bobSocket, "group-call:offer");
  assert.deepEqual(await emitAck(aliceSocket, "group-call:offer", {
    groupId: String(group.id),
    targetUserId: String(bob.id),
    description: { type: "offer", sdp: "phase102-group-offer" }
  }), { ok: true });
  const [groupOfferPayload] = await groupOffer;
  assert.equal(groupOfferPayload.groupId, String(group.id));
  assert.equal(groupOfferPayload.senderId, String(alice.id));
  assert.equal(groupOfferPayload.description.sdp, "phase102-group-offer");

  const handRaised = waitFor(aliceSocket, "group-call:hand-raised");
  assert.deepEqual(await emitAck(bobSocket, "group-call:hand-raise", {
    groupId: String(group.id), raised: true
  }), { ok: true, raised: true });
  const [handRaisedPayload] = await handRaised;
  assert.equal(handRaisedPayload.userId, String(bob.id));
  assert.equal(handRaisedPayload.raised, true);

  const muteRequested = waitFor(bobSocket, "group-call:mute-request");
  assert.deepEqual(await emitAck(aliceSocket, "group-call:moderate", {
    groupId: String(group.id), targetUserId: String(bob.id), action: "request-mute"
  }), {
    ok: true, action: "request-mute", targetUserId: String(bob.id)
  });
  const [mutePayload] = await muteRequested;
  assert.equal(mutePayload.groupId, String(group.id));

  const unauthorizedModeration = await emitAck(bobSocket, "group-call:moderate", {
    groupId: String(group.id), targetUserId: String(alice.id), action: "remove"
  });
  assert.deepEqual(unauthorizedModeration, {
    ok: false, error: "Only the call host or a group admin can moderate participants."
  });

  const groupEnded = waitFor(bobSocket, "group-call:ended");
  assert.deepEqual(await emitAck(aliceSocket, "group-call:end", {
    groupId: String(group.id)
  }), { ok: true });
  const [groupEndedPayload] = await groupEnded;
  assert.equal(groupEndedPayload.groupId, String(group.id));
  assert.equal(groupEndedPayload.reason, "host-ended");

  const offlineEvent = waitFor(bobSocket, "presence:update", 7000);
  const aliceSecondSession = await connectClient(url, tokenFor(alice));
  assert.equal(realtimeState.getOnlineUserIds().filter(id => id === String(alice.id)).length, 1);
  aliceSocket.disconnect();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(realtimeState.getOnlineUserIds().includes(String(alice.id)));
  aliceSecondSession.disconnect();
  const [offlinePayload] = await offlineEvent;
  assert.equal(offlinePayload.userId, String(alice.id));
  assert.equal(offlinePayload.online, false);

  const badSocket = createClient(url, { autoConnect: false, reconnection: false, timeout: 3000,
    transports: ["websocket"], auth: { token: "not-a-valid-token" } });
  clients.add(badSocket);
  const authError = waitFor(badSocket, "connect_error");
  badSocket.connect();
  const [error] = await authError;
  assert.match(error.message, /Invalid or expired/);
});

test.after(async () => {
  for (const client of clients) { try { client.disconnect(); } catch {} }
  if (ioServer) await new Promise(resolve => ioServer.close(resolve));
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (seededUserIds.length) {
    await pool.query("DELETE FROM messages WHERE sender_id = ANY($1::bigint[]) OR receiver_id = ANY($1::bigint[])", [seededUserIds]);
    await pool.query("DELETE FROM groups WHERE created_by = ANY($1::bigint[])", [seededUserIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [seededUserIds]);
  }
  await pool.end();
});
