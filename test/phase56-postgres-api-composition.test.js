"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const { createPostgresApiRouter } = require("../src/postgres/postgres-api-router");

const secret = "phase56-integration-secret-with-more-than-32-characters";
const jwt = { verify() { throw new Error("not used without a bearer token"); } };
const service = names => Object.fromEntries(names.map(name => [name, async () => ({})]));
const services = {
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
    services, jwt, jwtSecret: secret, getOnlineUserIds: () => ["101", 102]
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
    const response = await fetch(base + path);
    assert.equal(response.status, 401, path + " should be mounted and protected");
    assert.equal(typeof (await response.json()).error, "string");
  }
});

test("PostgreSQL API composition rejects incomplete service injection", () => {
  assert.throws(() => createPostgresApiRouter({
    services: {}, jwt, jwtSecret: secret
  }), /complete PostgreSQL auth service/);
});

test("PostgreSQL API composition requires a strong configured JWT secret", () => {
  assert.throws(() => createPostgresApiRouter({
    services, jwt, jwtSecret: "short"
  }), /at least 32 characters/);
});
