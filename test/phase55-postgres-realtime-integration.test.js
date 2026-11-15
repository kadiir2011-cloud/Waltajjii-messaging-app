"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { createAdapter } = require("@socket.io/postgres-adapter");
const { io: createClient } = require("socket.io-client");
const { createPostgresAdapter } = require("../src/db/postgres-adapter");
const { createPostgresStagingRuntime } = require("../src/postgres/postgres-staging-runtime");

const { assertDisposablePostgresDatabaseUrl } = require("../src/postgres/postgres-test-database-guard");
const connectionString = assertDisposablePostgresDatabaseUrl(
  process.env.TEST_DATABASE_URL, process.env.ALLOW_DISPOSABLE_POSTGRES_TESTS
);
const secret = "phase55-disposable-integration-secret-at-least-32-characters";
const pool = new Pool({ connectionString, max: 5, options: "-c search_path=waltajjii,public" });
const db = createPostgresAdapter(pool);
const clients = new Set();
let server, stagingRuntime, secondServer, secondStagingRuntime;
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

test("Phases 55 and 102: real PostgreSQL Socket.IO clients exercise presence, receipts, direct recovery and group calls", async () => {
  const root = path.join(__dirname, "..");
  for (const migration of ["001_initial_schema.sql", "002_channel_message_interactions.sql", "003_media_objects.sql", "004_media_storage_cleanup.sql", "005_socketio_cluster_adapter.sql"]) {
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

  stagingRuntime = createPostgresStagingRuntime({
    config: {
      appEnvironment: "staging",
      nodeEnvironment: "test",
      databaseUrl: connectionString,
      mediaBucket: "waltajjii-media-staging",
      jwtSecret: secret,
      storageClient: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async () => ({ error: null }),
          download: async () => ({ data: null, error: new Error("Storage is not used in this integration test.") })
        })
      },
      poolOptions: { max: 8, options: "-c search_path=waltajjii,public" },
      createSocketAdapter: createAdapter,
      socketAdapterOptions: { tableName: "socket_io_attachments", channelPrefix: "waltajjii-phase103" }
    },
    Pool, bcrypt, jwt,
    socketOptions: { cors: { origin: false } }
  });
  server = stagingRuntime.httpServer;
  const realtimeState = stagingRuntime.realtime;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;

  secondStagingRuntime = createPostgresStagingRuntime({
    config: {
      appEnvironment: "staging",
      nodeEnvironment: "test",
      databaseUrl: connectionString,
      mediaBucket: "waltajjii-media-staging",
      jwtSecret: secret,
      storageClient: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async () => ({ error: null }),
          download: async () => ({ data: null, error: new Error("Storage is not used in this integration test.") })
        })
      },
      poolOptions: { max: 8, options: "-c search_path=waltajjii,public" },
      createSocketAdapter: createAdapter,
      socketAdapterOptions: { tableName: "socket_io_attachments", channelPrefix: "waltajjii-phase103" }
    },
    Pool, bcrypt, jwt,
    socketOptions: { cors: { origin: false } }
  });
  secondServer = secondStagingRuntime.httpServer;
  await new Promise(resolve => secondServer.listen(0, "127.0.0.1", resolve));
  const secondUrl = "http://127.0.0.1:" + secondServer.address().port;

  const liveHealth = await fetch(url + "/health/live");
  assert.equal(liveHealth.status, 200);
  assert.deepEqual(await liveHealth.json(), { status: "ok", environment: "staging" });
  const readyHealth = await fetch(url + "/health/ready");
  assert.equal(readyHealth.status, 200);
  assert.deepEqual(await readyHealth.json(), { status: "ready", environment: "staging" });

  const apiUsername = "p102_api_" + Date.now();
  const apiPassword = "phase102-integration-password";
  const registration = await fetch(url + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: apiUsername, password: apiPassword })
  });
  assert.equal(registration.status, 201);
  const registrationPayload = await registration.json();
  assert.equal(registrationPayload.user.username, apiUsername);
  seededUserIds.push(String(registrationPayload.user.id));

  const login = await fetch(url + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: apiUsername, password: apiPassword })
  });
  assert.equal(login.status, 200);
  const loginPayload = await login.json();
  assert.ok(loginPayload.token);

  const profile = await fetch(url + "/api/auth/profile", {
    headers: { authorization: "Bearer " + loginPayload.token }
  });
  assert.equal(profile.status, 200);
  const profilePayload = await profile.json();
  assert.equal(profilePayload.user.username, apiUsername);

  const unauthorizedProfile = await fetch(url + "/api/auth/profile");
  assert.equal(unauthorizedProfile.status, 401);

  const aliceSocket = await connectClient(url, tokenFor(alice));
  const bobSocket = await connectClient(url, tokenFor(bob));
  const outsiderSocket = await connectClient(url, tokenFor(outsider));
  const remoteOutsiderSocket = await connectClient(secondUrl, tokenFor(outsider));
  assert.ok(realtimeState.getOnlineUserIds().includes(String(alice.id)));
  assert.ok(realtimeState.getOnlineUserIds().includes(String(bob.id)));

  // Broadcasts from one independently booted runtime reach a socket on the other.
  const clusterProbe = waitFor(remoteOutsiderSocket, "phase103:cluster-probe");
  stagingRuntime.realtime.io.to("user:" + String(outsider.id)).emit("phase103:cluster-probe", {
    source: "runtime-one", targetUserId: String(outsider.id)
  });
  const [clusterProbePayload] = await clusterProbe;
  assert.equal(clusterProbePayload.source, "runtime-one");
  assert.equal(clusterProbePayload.targetUserId, String(outsider.id));

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

  // A second device for the same account joins without consuming another
  // participant slot; leaving that device must not remove the account.
  const bobSecondSession = await connectClient(url, tokenFor(bob));
  const secondSessionAck = await emitAck(bobSecondSession, "group-call:join", {
    groupId: String(group.id)
  });
  assert.equal(secondSessionAck.ok, true);
  assert.equal(secondSessionAck.additionalSession, true);
  assert.equal(secondSessionAck.participants.length, 2);
  assert.deepEqual(await emitAck(bobSecondSession, "group-call:leave", {
    groupId: String(group.id)
  }), { ok: true });
  const participantCountAfterSecondDeviceLeaves = await emitAck(aliceSocket, "group-call:status", {
    groupId: String(group.id)
  });
  assert.equal(participantCountAfterSecondDeviceLeaves.participantCount, 2);
  bobSecondSession.disconnect();

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
  if (stagingRuntime) await stagingRuntime.close();
  if (secondStagingRuntime) await secondStagingRuntime.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (secondServer?.listening) await new Promise(resolve => secondServer.close(resolve));
  if (seededUserIds.length) {
    await pool.query("DELETE FROM messages WHERE sender_id = ANY($1::bigint[]) OR receiver_id = ANY($1::bigint[])", [seededUserIds]);
    await pool.query("DELETE FROM groups WHERE created_by = ANY($1::bigint[])", [seededUserIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [seededUserIds]);
  }
  await pool.end();
});
