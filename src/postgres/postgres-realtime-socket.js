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
  const activeGroupCalls = new Map();
  const activeGroupCallByUser = new Map();

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

    socket.on("call:caption", (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      const caption = typeof data.text === "string" ? data.text.trim() : "";
      if (!target || target === userId ||
          activeCalls.get(userId) !== target || activeCalls.get(target) !== userId) {
        return acknowledge({ ok: false, error: "Live captions are not authorized for this call." });
      }
      if (!caption || caption.length > 500) {
        return acknowledge({ ok: false, error: "Caption must contain between 1 and 500 characters." });
      }
      const now = Date.now();
      const window = socket.data.captionWindow;
      if (!window || now - window.startedAt >= 10000) {
        socket.data.captionWindow = { startedAt: now, count: 0 };
      }
      if (socket.data.captionWindow.count >= 20) {
        return acknowledge({ ok: false, error: "Live caption rate limit reached. Please slow down." });
      }
      socket.data.captionWindow.count += 1;
      emitToUser(target, "call:caption", {
        senderId: userId,
        senderUsername: socket.data.username,
        text: caption,
        sentAt: now
      });
      return acknowledge({ ok: true });
    });
    socket.on("call:end", data => {
      const target = validId(data?.targetUserId);
      if (target) endCall(userId, target, true);
    });


    // Phase 101: direct-call recovery is relayed only between the two
    // authenticated participants of the currently tracked call.
    socket.on("call:recovery-request", (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      if (!target || activeCalls.get(userId) !== target || activeCalls.get(target) !== userId) {
        return acknowledge({ ok: false, error: "There is no active call to recover." });
      }
      if (!roomHasSockets("user:" + target)) {
        return acknowledge({ ok: false, error: "The other participant is no longer connected." });
      }
      emitToUser(target, "call:recovery-requested", { senderId: userId });
      return acknowledge({ ok: true });
    });
    socket.on("call:recovery-offer", (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      const offer = data.offer;
      if (!target || !offer || typeof offer !== "object" || Array.isArray(offer) ||
          activeCalls.get(userId) !== target || activeCalls.get(target) !== userId) {
        return acknowledge({ ok: false, error: "Call recovery offer is not authorized." });
      }
      emitToUser(target, "call:recovery-offer", { senderId: userId, offer });
      return acknowledge({ ok: true });
    });
    socket.on("call:recovery-answer", (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      const answer = data.answer;
      if (!target || !answer || typeof answer !== "object" || Array.isArray(answer) ||
          activeCalls.get(userId) !== target || activeCalls.get(target) !== userId) {
        return acknowledge({ ok: false, error: "Call recovery answer is not authorized." });
      }
      emitToUser(target, "call:recovery-answer", { senderId: userId, answer });
      return acknowledge({ ok: true });
    });

    // Group calls are signaling-only; audio/video media remains peer-to-peer.
    // Membership is rechecked against PostgreSQL for every privileged action.
    const groupCallMembership = new Set();

    async function currentGroupMember(groupId) {
      return realtimeService.isGroupMember(groupId, userId);
    }
    async function leaveGroupCall(groupId, participantId, notify = true) {
      const call = activeGroupCalls.get(groupId);
      if (!call || !call.participants.has(participantId)) return false;
      const sockets = call.participantSockets?.get(participantId) || new Set();
      sockets.delete(socket.id);
      await socket.leave("group-call:" + groupId);
      groupCallMembership.delete(groupId);
      if (sockets.size) return true;
      call.participantSockets?.delete(participantId);
      const username = call.participants.get(participantId);
      call.participants.delete(participantId);
      call.handRaised.delete(participantId);
      activeGroupCallByUser.delete(participantId);
      if (notify) {
        io.to("group-call:" + groupId).emit("group-call:participant-left", {
          groupId, userId: participantId, username
        });
      }
      if (call.participants.size === 0 || (call.hostId === participantId && notify)) {
        for (const id of call.participants.keys()) activeGroupCallByUser.delete(id);
        activeGroupCalls.delete(groupId);
        io.to("group-call:" + groupId).emit("group-call:ended", {
          groupId, reason: call.hostId === participantId ? "host-ended" : "empty"
        });
        io.to("group:" + groupId).emit("group-call:ended", {
          groupId, reason: call.hostId === participantId ? "host-ended" : "empty"
        });
        io.in("group-call:" + groupId).socketsLeave("group-call:" + groupId);
      }
      return true;
    }

    socket.on("group-call:start", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        if (!await currentGroupMember(groupId)) {
          return acknowledge({ ok: false, error: "Only current group members can start a group call." });
        }
        if (activeCalls.has(userId)) return acknowledge({ ok: false, error: "End your one-to-one call before joining a group call." });
        if (activeGroupCallByUser.has(userId)) return acknowledge({ ok: false, error: "You are already in another group call." });
        if (activeGroupCalls.has(groupId)) return acknowledge({ ok: false, error: "A group call is already active." });
        const call = {
          groupId, hostId: userId,
          participants: new Map([[userId, socket.data.username]]),
          participantSockets: new Map([[userId, new Set([socket.id])]]),
          handRaised: new Set()
        };
        activeGroupCalls.set(groupId, call);
        activeGroupCallByUser.set(userId, groupId);
        groupCallMembership.add(groupId);
        await socket.join("group-call:" + groupId);
        io.to("group:" + groupId).emit("group-call:available", {
          groupId, hostId: userId, hostUsername: socket.data.username
        });
        return acknowledge({ ok: true, groupId, participants: [{ userId, username: socket.data.username }] });
      } catch {
        return acknowledge({ ok: false, error: "Could not verify group membership or start the call." });
      }
    });

    socket.on("group-call:status", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        if (!await currentGroupMember(groupId)) {
          return acknowledge({ ok: false, error: "You are not a current member of this group." });
        }
        const call = activeGroupCalls.get(groupId);
        return acknowledge({
          ok: true, groupId, active: Boolean(call),
          hostUsername: call ? call.participants.get(call.hostId) : null,
          participantCount: call ? call.participants.size : 0
        });
      } catch {
        return acknowledge({ ok: false, error: "Could not verify group membership." });
      }
    });

    socket.on("group-call:join", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        if (!await currentGroupMember(groupId)) {
          return acknowledge({ ok: false, error: "No active group call is available to you." });
        }
        const call = activeGroupCalls.get(groupId);
        if (!call) return acknowledge({ ok: false, error: "No active group call is available to you." });
        if (activeCalls.has(userId)) return acknowledge({ ok: false, error: "End your one-to-one call before joining a group call." });
        const existingGroupId = activeGroupCallByUser.get(userId);
        if (existingGroupId && existingGroupId !== groupId) {
          return acknowledge({ ok: false, error: "You are already in another group call." });
        }
        const alreadyParticipating = call.participants.has(userId);
        if (!alreadyParticipating && call.participants.size >= 8) {
          return acknowledge({ ok: false, error: "This group call has reached its 8-person limit." });
        }
        if (!alreadyParticipating) {
          call.participants.set(userId, socket.data.username);
          activeGroupCallByUser.set(userId, groupId);
        }
        call.participantSockets ||= new Map();
        const participantSockets = call.participantSockets.get(userId) || new Set();
        participantSockets.add(socket.id);
        call.participantSockets.set(userId, participantSockets);
        groupCallMembership.add(groupId);
        await socket.join("group-call:" + groupId);
        const participants = Array.from(call.participants, ([id, username]) => ({ userId: id, username }));
        socket.emit("group-call:participants", { groupId, participants });
        if (!alreadyParticipating) {
          socket.to("group-call:" + groupId).emit("group-call:participant-joined", {
            groupId, userId, username: socket.data.username
          });
        }
        return acknowledge({ ok: true, groupId, participants, additionalSession: alreadyParticipating });
      } catch {
        return acknowledge({ ok: false, error: "Could not verify group membership or join the call." });
      }
    });

    for (const eventName of ["group-call:offer", "group-call:answer", "group-call:ice-candidate"]) {
      socket.on(eventName, async (data = {}, acknowledge = () => {}) => {
        const groupId = validId(data.groupId);
        const target = validId(data.targetUserId);
        const call = groupId && activeGroupCalls.get(groupId);
        const payload = eventName === "group-call:ice-candidate" ? data.candidate : data.description;
        if (!groupId || !target || !call || !call.participants.has(userId) ||
            !call.participants.has(target) || target === userId ||
            !payload || typeof payload !== "object" || Array.isArray(payload)) {
          return acknowledge({ ok: false, error: "Group-call signaling is not authorized." });
        }
        try {
          if (!await currentGroupMember(groupId) || !await realtimeService.isGroupMember(groupId, target)) {
            return acknowledge({ ok: false, error: "A participant is no longer a group member." });
          }
          emitToUser(target, eventName, {
            groupId, senderId: userId, senderUsername: socket.data.username,
            ...(eventName === "group-call:ice-candidate" ? { candidate: payload } : { description: payload })
          });
          return acknowledge({ ok: true });
        } catch {
          return acknowledge({ ok: false, error: "Could not verify group-call participants." });
        }
      });
    }

    socket.on("group-call:hand-raise", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      const call = groupId && activeGroupCalls.get(groupId);
      if (!call || !call.participants.has(userId) || typeof data.raised !== "boolean") {
        return acknowledge({ ok: false, error: "You are not an active participant in this group call." });
      }
      try {
        if (!await currentGroupMember(groupId)) {
          return acknowledge({ ok: false, error: "You are no longer a member of this group." });
        }
        if (data.raised) call.handRaised.add(userId);
        else call.handRaised.delete(userId);
        io.to("group-call:" + groupId).emit("group-call:hand-raised", {
          groupId, userId, username: socket.data.username, raised: data.raised
        });
        return acknowledge({ ok: true, raised: data.raised });
      } catch {
        return acknowledge({ ok: false, error: "Could not verify group membership." });
      }
    });

    socket.on("group-call:moderate", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      const target = validId(data.targetUserId);
      const action = String(data.action || "");
      const call = groupId && activeGroupCalls.get(groupId);
      if (!groupId || !target || !call || !call.participants.has(userId) ||
          !call.participants.has(target) || target === userId) {
        return acknowledge({ ok: false, error: "This moderation action is not available for the current call." });
      }
      if (!["remove", "lower-hand", "request-mute"].includes(action)) {
        return acknowledge({ ok: false, error: "Unsupported moderation action." });
      }
      try {
        if (!await currentGroupMember(groupId)) {
          return acknowledge({ ok: false, error: "You are no longer a member of this group." });
        }
        const role = await realtimeService.getGroupMemberRole(groupId, userId);
        const canModerate = call.hostId === userId || role === "admin";
        if (!canModerate) return acknowledge({ ok: false, error: "Only the call host or a group admin can moderate participants." });
        if (!await realtimeService.isGroupMember(groupId, target)) {
          return acknowledge({ ok: false, error: "The target is no longer a group member." });
        }
        if (action === "remove") {
          if (target === call.hostId) return acknowledge({ ok: false, error: "The call host cannot be removed." });
          const targetUsername = call.participants.get(target);
          call.participants.delete(target);
          call.handRaised.delete(target);
          activeGroupCallByUser.delete(target);
          emitToUser(target, "group-call:removed", { groupId, reason: "removed-by-moderator" });
          io.in("user:" + target).socketsLeave("group-call:" + groupId);
          io.to("group-call:" + groupId).emit("group-call:participant-left", {
            groupId, userId: target, username: targetUsername, reason: "removed"
          });
          if (call.participants.size === 0) activeGroupCalls.delete(groupId);
        } else if (action === "lower-hand") {
          call.handRaised.delete(target);
          io.to("group-call:" + groupId).emit("group-call:hand-raised", {
            groupId, userId: target, username: call.participants.get(target), raised: false
          });
        } else {
          emitToUser(target, "group-call:mute-request", {
            groupId, requestedBy: socket.data.username
          });
        }
        return acknowledge({ ok: true, action, targetUserId: target });
      } catch {
        return acknowledge({ ok: false, error: "Could not verify group-call moderator permissions." });
      }
    });

    socket.on("group-call:leave", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        return acknowledge({ ok: await leaveGroupCall(groupId, userId, true) });
      } catch {
        return acknowledge({ ok: false, error: "Could not leave the group call." });
      }
    });
    socket.on("group-call:end", (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      const call = groupId && activeGroupCalls.get(groupId);
      if (!call || call.hostId !== userId) {
        return acknowledge({ ok: false, error: "Only the group-call host can end this call for everyone." });
      }
      activeGroupCalls.delete(groupId);
      for (const participantId of call.participants.keys()) {
        activeGroupCallByUser.delete(participantId);
        groupCallMembership.delete(groupId);
      }
      io.to("group-call:" + groupId).emit("group-call:ended", { groupId, reason: "host-ended" });
      io.to("group:" + groupId).emit("group-call:ended", { groupId, reason: "host-ended" });
      io.in("group-call:" + groupId).socketsLeave("group-call:" + groupId);
      return acknowledge({ ok: true });
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

    socket.on("disconnect", async () => {
      stopDirectTyping();
      for (const groupId of socket.data.typingGroups) {
        socket.to("group:" + groupId).emit("group:typing:update", {
          groupId, userId, username: socket.data.username, isTyping: false
        });
      }
      socket.data.typingGroups.clear();
      const callPeer = activeCalls.get(userId);
      if (callPeer) endCall(userId, callPeer, true);
      for (const groupId of Array.from(groupCallMembership)) {
        try { await leaveGroupCall(groupId, userId, true); }
        catch (error) {
          console.error("PostgreSQL group-call disconnect cleanup failed:", error?.message || "Unknown error");
        }
      }
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
