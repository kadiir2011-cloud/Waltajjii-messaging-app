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
const { createPostgresUploadsRouter } = require("../routes/postgres-uploads");
const { createPostgresCallsRouter } = require("../routes/postgres-calls");

/**
 * Opt-in PostgreSQL API composition for integration tests and controlled
 * staging. The caller owns the Express app, DB pool, services, HTTP server,
 * Socket.IO lifecycle, and the production cutover decision.
 *
 * Uploads and TURN credentials are composed through injected PostgreSQL media
 * storage and provider configuration. Translation remains in the existing
 * database-independent server layer until its shared API contract is extracted.
 */
function createPostgresApiRouter({
  services,
  jwt,
  jwtSecret,
  limiter,
  publicAppUrl = "",
  momentsMedia = {},
  io = null,
  getOnlineUserIds = () => [],
  mediaStorage,
  db,
  meteredApiKey,
  fetchImpl,
  uploadMiddleware,
  profileUploadMiddleware,
  momentUploadMiddleware
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

  if (!mediaStorage || !["upload", "removeOwned", "removeById", "downloadOwned", "downloadForViewer"].every(k => typeof mediaStorage[k] === "function") || !db) throw new TypeError("Complete PostgreSQL media storage and database services are required.");

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
  const durableMomentMedia = {
    uploadMiddleware: momentUploadMiddleware,
    storeMedia: async (file, ownerId) => {
      const stored = await mediaStorage.upload(ownerId, file, "moment");
      const mime = String(file.mimetype || "").split(";")[0].toLowerCase();
      return { filename: String(stored.id), type: mime.startsWith("video/") ? "video" : "image" };
    },
    removeMedia: async (mediaId, ownerId) => ownerId
      ? mediaStorage.removeOwned(ownerId, mediaId)
      : mediaStorage.removeById(mediaId),
    readMedia: async (media, res) => {
      const result = await mediaStorage.downloadOwned(media.ownerId, media.mediaPath);
      res.setHeader("Content-Type", result.metadata.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(result.buffer.length));
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(result.buffer);
    }
  };
  router.use("/moments", createPostgresMomentsRouter({
    momentsService: services.moments, jwtSecret, jwtImplementation: jwt,
    ...durableMomentMedia, ...momentsMedia
  }));
  router.use("/presence", createPostgresPresenceRouter({
    realtimeService: services.realtime, jwt, jwtSecret
  }));
  router.use("/uploads", createPostgresUploadsRouter({
    mediaStorage, db, jwtSecret, jwtImplementation: jwt,
    uploadMiddleware, profileUploadMiddleware
  }));
  router.use("/calls", createPostgresCallsRouter({
    jwtSecret, jwtImplementation: jwt, apiKey: meteredApiKey, fetchImpl
  }));

  return router;
}

module.exports = { createPostgresApiRouter };
