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
const mediaStorage = { upload: async () => ({ id: "777" }), removeOwned: async () => ({ removed: true }), downloadOwned: async () => ({ metadata: { mimeType: "image/png" }, buffer: Buffer.from("image") }), downloadForViewer: async () => ({ metadata: { mimeType: "image/png" }, buffer: Buffer.from("image") }) };\nconst db = { one: async () => null, execute: async () => 1 };\nconst services = {
  auth: service(["register", "login", "getProfile", "updateProfile"]),
  messages: service(["listUsers", "sendMessage", "getConversation", "markConversationRead", "deleteMessage", "editMessage", "forwardMessage", "toggleReaction"]),
  groups: service(["createGroup", "listGroups", "listMembers", "addMember", "getMessages", "sendMessage", "markDelivered", "toggleReaction", "editMessage", "deleteMessage", "pinMessage"]),
  governance: service(["changeRole", "leave", "removeMember", "updateDetails", "getDetails", "listActivity", "createInvitation", "listInvitations", "revokeInvitation", "previewInvitation", "joinByInvitation", "listJoinRequests", "reviewJoinRequest", "listPolls", "createPoll", "votePoll", "closePoll", "listEvents", "createEvent", "rsvp", "cancelEvent"]),
  channels: service(["listChannels", "createChannel", "joinChannel", "listMembers", "addMember", "removeMember", "getMessages", "publishMessage", "markDelivered", "markRead", "toggleReaction", "editMessage", "deleteMessage", "pinMessage", "leaveChannel"]),
  social: service(["discover", "follow", "unfollow", "connect", "listRequests", "respondRequest", "followers", "following", "feed", "createPost", "toggleLike", "listComments", "createComment", "listNotifications", "markNotificationsRead"]),
  moments: service(["cleanupExpired", "listVisible", "create", "getVisibleMedia", "deleteOwn"]),
  realtime: service(["getOnlineProfiles"])
};

test("PostgreSQL API composition mounts protected feature routers without switching production", async t => {
  const app = express();
  app.use(express.json());
  app.use("/api", createPostgresApiRouter({
    services, jwt, jwtSecret: secret, getOnlineUserIds: () => ["101", 102], mediaStorage, db, meteredApiKey: ""
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
    "/api/presence/online",\n    "/api/uploads/777"
  ]) {
    const unauthorized = await fetch(base + path);
    assert.equal(unauthorized.status, 401, path + " should reject anonymous requests");
    const response = await fetch(base + path, {
      headers: { Authorization: "Bearer " + token }
    });
    assert.equal(response.status, 200, path + " should be mounted and accept an authenticated request");
    assert.ok(await response.json());
  }
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
