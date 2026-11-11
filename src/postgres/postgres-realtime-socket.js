"use strict";

/**
 * Attaches PostgreSQL-backed realtime behavior to an existing Socket.IO
 * server. All database access is delegated to the injected async service.
 * This module is intentionally not mounted by the live SQLite server.
 */
function attachPostgresRealtime(io, { jwt, jwtSecret, realtimeService } = {}) {
  if (!io || typeof io.use !== "function" || typeof io.on !== "function") {
    throw new TypeError("A Socket.IO server is required.");
  }
  if (!jwt || typeof jwt.verify !== "function") {
    throw new TypeError("A JWT verifier is required.");
  }
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new TypeError("A JWT secret of at least 32 characters is required.");
  }
  if (!realtimeService ||
      typeof realtimeService.listGroupIdsForUser !== "function" ||
      typeof realtimeService.isGroupMember !== "function" ||
      typeof realtimeService.markMessageDelivered !== "function") {
    throw new TypeError("A complete PostgreSQL realtime service is required.");
  }

  const onlineUsers = new Map();
  const activeCalls = new Map();

  function roomHasSockets(room) {
    return Boolean(io.sockets?.adapter?.rooms?.get(room)?.size);
  }
  function emitToUser(userId, event, payload) {
    io.to("user:" + String(userId)).emit(event, payload);
  }
  function validId(value) {
    const id = String(value ?? "");
    return /^[1-9][0-9]*$/.test(id) ? id : null;
  }
  function endCall(userId, targetUserId, notify = true) {
    const user = String(userId);
    const target = String(targetUserId);
    if (!user || !target || user === target ||
        activeCalls.get(user) !== target || activeCalls.get(target) !== user) return false;
    activeCalls.delete(user);
    activeCalls.delete(target);
    if (notify) emitToUser(target, "call:ended", { senderId: user });
    return true;
  }

  io.use((socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token) return next(new Error("Authentication required."));
      const claims = jwt.verify(token, jwtSecret, {
        issuer: "waltajjii",
        audience: "waltajjii-users"
      });
      if (!claims?.userId || !claims?.username) return next(new Error("Invalid user token."));
      socket.data.userId = String(claims.userId);
      socket.data.username = claims.username;
      return next();
    } catch {
      return next(new Error("Invalid or expired login token."));
    }
  });

  io.on("connection", async socket => {
    const userId = String(socket.data.userId);
    const userRoom = "user:" + userId;
    const wasOnline = onlineUsers.has(userId);
    socket.data.typingTo = null;
    socket.data.typingGroups = new Set();
    await socket.join(userRoom);
    onlineUsers.set(userId, socket.data.username);

    socket.emit("presence:snapshot", {
      users: Array.from(onlineUsers, ([id, username]) => ({ userId: id, username }))
    });
    if (!wasOnline) {
      io.emit("presence:update", { userId, username: socket.data.username, online: true });
    }

    function stopDirectTyping() {
      const target = socket.data.typingTo;
      if (!target) return;
      emitToUser(target, "typing:update", {
        userId, username: socket.data.username, isTyping: false
      });
      socket.data.typingTo = null;
    }

    socket.on("typing:start", (data = {}) => {
      const target = validId(data.targetUserId);
      if (!target || target === userId || !roomHasSockets("user:" + target)) return;
      if (socket.data.typingTo && socket.data.typingTo !== target) stopDirectTyping();
      socket.data.typingTo = target;
      emitToUser(target, "typing:update", {
        userId, username: socket.data.username, isTyping: true
      });
    });
    socket.on("typing:stop", data => {
      const target = validId(data?.targetUserId);
      if (!target || socket.data.typingTo === target) stopDirectTyping();
    });

    socket.on("group:typing:start", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        if (!await realtimeService.isGroupMember(groupId, userId)) {
          return acknowledge({ ok: false, error: "You are not a member of this group." });
        }
        if (!socket.data.typingGroups.has(groupId)) {
          socket.data.typingGroups.add(groupId);
          socket.to("group:" + groupId).emit("group:typing:update", {
            groupId, userId, username: socket.data.username, isTyping: true
          });
        }
        return acknowledge({ ok: true });
      } catch {
        return acknowledge({ ok: false, error: "Could not verify group membership." });
      }
    });
    socket.on("group:typing:stop", data => {
      const groupId = validId(data?.groupId);
      if (!groupId || !socket.data.typingGroups.has(groupId)) return;
      socket.data.typingGroups.delete(groupId);
      socket.to("group:" + groupId).emit("group:typing:update", {
        groupId, userId, username: socket.data.username, isTyping: false
      });
    });

    socket.on("message:delivered", async (data = {}, acknowledge = () => {}) => {
      const messageId = validId(data.messageId);
      if (!messageId) return acknowledge({ ok: false, error: "Invalid message." });
      try {
        const receipt = await realtimeService.markMessageDelivered(messageId, userId);
        if (!receipt) return acknowledge({ ok: false, error: "Message not found for this recipient." });
        emitToUser(receipt.senderId, "message:status", {
          ...receipt, status: receipt.readAt ? "read" : "delivered"
        });
        return acknowledge({ ok: true });
      } catch {
        return acknowledge({ ok: false, error: "Could not update message delivery." });
      }
    });

    socket.on("call:offer", (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      const offer = data.offer;
      if (!target || target === userId || !offer || typeof offer !== "object" || Array.isArray(offer)) {
        return acknowledge({ ok: false, error: "Invalid call offer." });
      }
      if (!roomHasSockets("user:" + target)) return acknowledge({ ok: false, error: "Recipient is not connected." });
      if (activeCalls.has(userId) || activeCalls.has(target)) {
        return acknowledge({ ok: false, error: "One participant is already in a call." });
      }
      activeCalls.set(userId, target);
      activeCalls.set(target, userId);
      emitToUser(target, "call:incoming", {
        callerId: userId, callerUsername: socket.data.username, offer
      });
      return acknowledge({ ok: true });
    });
    socket.on("call:answer", (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      const answer = data.answer;
      if (!target || !answer || typeof answer !== "object" || Array.isArray(answer) ||
          activeCalls.get(userId) !== target || activeCalls.get(target) !== userId) {
        return acknowledge({ ok: false, error: "Call answer is not authorized." });
      }
      emitToUser(target, "call:accepted", {
        recipientId: userId, recipientUsername: socket.data.username, answer
      });
      return acknowledge({ ok: true });
    });
    socket.on("call:ice-candidate", data => {
      const target = validId(data?.targetUserId);
      const candidate = data?.candidate;
      if (!target || !candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
          activeCalls.get(userId) !== target || activeCalls.get(target) !== userId) return;
      emitToUser(target, "call:ice-candidate", { senderId: userId, candidate });
    });
    socket.on("call:end", data => {
      const target = validId(data?.targetUserId);
      if (target) endCall(userId, target, true);
    });

    try {
      const groupIds = await realtimeService.listGroupIdsForUser(userId);
      for (const rawGroupId of groupIds) {
        const groupId = validId(rawGroupId);
        if (groupId) await socket.join("group:" + groupId);
      }
    } catch (error) {
      // Keep the authenticated user connected; group authorization still checks
      // membership against PostgreSQL before accepting group typing events.
      console.error("PostgreSQL group room initialization failed:", error?.message || "Unknown error");
    }

    socket.on("disconnect", () => {
      stopDirectTyping();
      for (const groupId of socket.data.typingGroups) {
        socket.to("group:" + groupId).emit("group:typing:update", {
          groupId, userId, username: socket.data.username, isTyping: false
        });
      }
      socket.data.typingGroups.clear();
      const callPeer = activeCalls.get(userId);
      if (callPeer) endCall(userId, callPeer, true);
      if (!roomHasSockets(userRoom)) {
        onlineUsers.delete(userId);
        io.emit("presence:update", { userId, username: socket.data.username, online: false });
      }
    });
  });

  return Object.freeze({
    getOnlineUserIds: () => Array.from(onlineUsers.keys()),
    getOnlineUserSnapshot: () => Array.from(onlineUsers, ([userId, username]) => ({ userId, username }))
  });
}

module.exports = { attachPostgresRealtime };
