"use strict";

const express = require("express");
const { createPostgresAuthRouter } = require("../routes/postgres-auth");
const { createPostgresMessagesRouter } = require("../routes/postgres-messages");
const { createPostgresGroupsRouter } = require("../routes/postgres-groups");
const { createPostgresGroupGovernanceRouter } = require("../routes/postgres-group-governance");
const { createPostgresChannelsRouter } = require("../routes/postgres-channels");
const { createPostgresSocialRouter } = require("../routes/postgres-social");
const { createPostgresMomentsRouter } = require("../routes/postgres-moments");
const { createPostgresPresenceRouter } = require("../routes/postgres-presence");

/**
 * Opt-in PostgreSQL API composition for integration tests and controlled
 * staging. The caller owns the Express app, DB pool, services, HTTP server,
 * Socket.IO lifecycle, and the production cutover decision.
 *
 * This intentionally does not mount uploads, calls/TURN, or translation:
 * those API contracts still require PostgreSQL-compatible implementations.
 */
function createPostgresApiRouter({
  services,
  jwt,
  jwtSecret,
  limiter,
  publicAppUrl = "",
  momentsMedia = {},
  io = null,
  getOnlineUserIds = () => []
} = {}) {
  const required = [
    ["auth", ["register", "login", "getProfile", "updateProfile"]],
    ["messages", ["listUsers", "sendMessage", "getConversation", "markConversationRead", "deleteMessage", "editMessage", "forwardMessage", "toggleReaction"]],
    ["groups", ["createGroup", "listGroups", "listMembers", "addMember", "getMessages", "sendMessage", "markDelivered", "toggleReaction", "editMessage", "deleteMessage", "pinMessage"]],
    ["governance", ["changeRole", "leave", "removeMember", "updateDetails", "getDetails", "listActivity", "createInvitation", "listInvitations", "revokeInvitation", "previewInvitation", "joinByInvitation", "listJoinRequests", "reviewJoinRequest", "listPolls", "createPoll", "votePoll", "closePoll", "listEvents", "createEvent", "rsvp", "cancelEvent"]],
    ["channels", ["listChannels", "createChannel", "joinChannel", "listMembers", "addMember", "removeMember", "getMessages", "publishMessage", "markDelivered", "markRead", "toggleReaction", "editMessage", "deleteMessage", "pinMessage", "leaveChannel"]],
    ["social", ["discover", "follow", "unfollow", "connect", "listRequests", "respondRequest", "followers", "following", "feed", "createPost", "toggleLike", "listComments", "createComment", "listNotifications", "markNotificationsRead"]],
    ["moments", ["cleanupExpired", "listVisible", "create", "getVisibleMedia", "deleteOwn"]],
    ["realtime", ["getOnlineProfiles"]]
  ];
  if (!services || typeof services !== "object") {
    throw new TypeError("PostgreSQL API services are required.");
  }
  for (const [name, methods] of required) {
    if (!services[name] || !methods.every(method => typeof services[name][method] === "function")) {
      throw new TypeError("A complete PostgreSQL " + name + " service is required.");
    }
  }
  if (!jwt || typeof jwt.verify !== "function") {
    throw new TypeError("A JWT implementation with verify() is required.");
  }
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new TypeError("A JWT secret of at least 32 characters is required.");
  }
  if (typeof getOnlineUserIds !== "function") {
    throw new TypeError("getOnlineUserIds must be a function.");
  }

  const router = express.Router();
  router.use((req, res, next) => {
    req.app.set("onlineUserIds", getOnlineUserIds().map(String));
    if (io) req.app.set("io", io);
    next();
  });

  router.use("/auth", createPostgresAuthRouter({
    authService: services.auth, jwt, jwtSecret, limiter
  }));
  router.use("/messages", createPostgresMessagesRouter({
    messagesService: services.messages, jwtSecret, jwtImplementation: jwt
  }));
  router.use("/groups", createPostgresGroupsRouter({
    groupsService: services.groups, jwtSecret, jwtImplementation: jwt
  }));
  router.use("/groups", createPostgresGroupGovernanceRouter({
    governanceService: services.governance, jwtSecret,
    jwtImplementation: jwt, publicAppUrl
  }));
  router.use("/channels", createPostgresChannelsRouter({
    channelsService: services.channels, jwtSecret, jwtImplementation: jwt
  }));
  router.use("/social", createPostgresSocialRouter({
    socialService: services.social, jwtSecret, jwtImplementation: jwt
  }));
  router.use("/moments", createPostgresMomentsRouter({
    momentsService: services.moments, jwtSecret, jwtImplementation: jwt,
    ...momentsMedia
  }));
  router.use("/presence", createPostgresPresenceRouter({
    realtimeService: services.realtime, jwt, jwtSecret
  }));

  return router;
}

module.exports = { createPostgresApiRouter };
