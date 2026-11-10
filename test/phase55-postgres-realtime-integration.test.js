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
  if (seededUserIds.length) await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [seededUserIds]);
  await pool.end();
});
