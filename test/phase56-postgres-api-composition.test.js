"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { createPostgresApiRouter } = require("../src/postgres/postgres-api-router");

const secret = "phase56-integration-secret-with-more-than-32-characters";
const token = jwt.sign({ userId: "101", username: "phase56-user" }, secret, { issuer: "waltajjii", audience: "waltajjii-users" });
const service = names => Object.fromEntries(names.map(name => [name, async () => ({})]));
const mediaCalls = [];
const mediaStorage = { upload: async (...args) => { mediaCalls.push(args); return { id: "777" }; }, removeOwned: async () => ({ removed: true }), removeById: async () => ({ removed: true }), downloadOwned: async () => ({ metadata: { mimeType: "image/png" }, buffer: Buffer.from("image") }), downloadForViewer: async () => ({ metadata: { mimeType: "image/png" }, buffer: Buffer.from("image") }) };
const db = { one: async () => null, execute: async () => 1 };
const services = {
  auth: service(["register", "login", "getProfile", "updateProfile"]),
  messages: service(["listUsers", "sendMessage", "getConversation", "markConversationRead", "deleteMessage", "editMessage", "forwardMessage", "toggleReaction"]),
  groups: service(["createGroup", "listGroups", "listMembers", "addMember", "getMessages", "sendMessage", "markDelivered", "toggleReaction", "editMessage", "deleteMessage", "pinMessage"]),
  governance: service(["changeRole", "leave", "removeMember", "updateDetails", "getDetails", "listActivity", "createInvitation", "listInvitations", "revokeInvitation", "previewInvitation", "joinByInvitation", "listJoinRequests", "reviewJoinRequest", "listPolls", "createPoll", "votePoll", "closePoll", "listEvents", "createEvent", "rsvp", "cancelEvent"]),
  channels: service(["listChannels", "createChannel", "joinChannel", "listMembers", "addMember", "removeMember", "getMessages", "publishMessage", "markDelivered", "markRead", "toggleReaction", "editMessage", "deleteMessage", "pinMessage", "leaveChannel"]),
  social: service(["discover", "follow", "unfollow", "connect", "listRequests", "respondRequest", "followers", "following", "feed", "createPost", "toggleLike", "listComments", "createComment", "listNotifications", "markNotificationsRead"]),
  moments: {
    cleanupExpired: async () => [],
    listVisible: async () => [],
    create: async () => ({ moment: { id: "22" } }),
    getVisibleMedia: async () => ({ ownerId: "101", mediaPath: "777", mediaType: "image" }),
    deleteOwn: async () => ({ mediaPath: "777" })
  },
  realtime: service(["getOnlineProfiles"])
};

test("PostgreSQL API composition mounts protected feature routers without switching production", async t => {
  const app = express();
  app.use(express.json());
  app.use("/api", createPostgresApiRouter({
    services, jwt, jwtSecret: secret, getOnlineUserIds: () => ["101", 102], mediaStorage, db, meteredApiKey: "", momentUploadMiddleware: (req, res, next) => { req.file = { buffer: Buffer.from("moment"), mimetype: "image/png" }; next(); }
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;

  for (const path of [
    "/api/auth/profile",
    "/api/messages/users",
    "/api/groups",
    "/api/groups/12/details",
    "/api/groups/12/polls",
    "/api/channels",
    "/api/social/feed",
    "/api/moments",
    "/api/presence/online"
  ]) {
    const unauthorized = await fetch(base + path);
    assert.equal(unauthorized.status, 401, path + " should reject anonymous requests");
    const response = await fetch(base + path, {
      headers: { Authorization: "Bearer " + token }
    });
    assert.equal(response.status, 200, path + " should be mounted and accept an authenticated request");
    assert.ok(await response.json());
  }
  const headers = { Authorization: "Bearer " + token };
  const moment = await fetch(base + "/api/moments", {
    method: "POST", headers,
    body: "test multipart body"
  });
  assert.equal(moment.status, 201);
  assert.equal(mediaCalls[0][0], "101");
  assert.equal(mediaCalls[0][2], "moment");
  const momentMedia = await fetch(base + "/api/moments/media/22", { headers });
  assert.equal(momentMedia.status, 200);
  assert.equal(await momentMedia.text(), "image");
  const qr = await fetch(base + "/api/groups/invitation/qr", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ url: base + "/?groupInvite=" + "A".repeat(48) })
  });
  assert.equal(qr.status, 200);
  assert.match((await qr.json()).dataUrl, /^data:image\/png;base64,/);
  const media = await fetch(base + "/api/uploads/777", {
    headers: { Authorization: "Bearer " + token }
  });
  assert.equal(media.status, 200);
  assert.equal(await media.text(), "image");
  const calls = await fetch(base + "/api/calls/turn-credentials", {
    headers: { Authorization: "Bearer " + token }
  });
  assert.equal(calls.status, 503);
  assert.match((await calls.json()).error, /not configured/);
});

test("PostgreSQL API composition rejects incomplete service injection", () => {
  assert.throws(() => createPostgresApiRouter({
    services: {}, jwt, jwtSecret: secret, mediaStorage, db
  }), /complete PostgreSQL auth service/);
});

test("PostgreSQL API composition requires a strong configured JWT secret", () => {
  assert.throws(() => createPostgresApiRouter({
    services, jwt, jwtSecret: "short", mediaStorage, db
  }), /at least 32 characters/);
});
