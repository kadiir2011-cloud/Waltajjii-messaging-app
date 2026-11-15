"use strict";

/**
 * Attaches PostgreSQL-backed realtime behavior to an existing Socket.IO
 * server. All database access is delegated to the injected async service.
 * This module is intentionally not mounted by the live SQLite server.
 */
function attachPostgresRealtime(io, { jwt, jwtSecret, realtimeService, callState, serverId = require("node:crypto").randomUUID() } = {}) {
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

  if (!callState || ![
    "startGroupCall", "joinGroupCall", "heartbeat", "leaveSession",
    "getGroupCallStatus", "endGroupCall", "setHandRaised", "moderateGroupCall",
    "hasActiveCall", "startDirectCall", "acceptDirectCall", "authorizeDirectCall", "getDirectCallStatus", "endDirectCall"
  ].every(method => typeof callState[method] === "function")) {
    throw new TypeError("A complete shared PostgreSQL call-state service is required.");
  }
  if (typeof serverId !== "string" || !serverId.trim()) {
    throw new TypeError("A unique realtime server ID is required.");
  }
  const onlineUsers = new Map();

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

    socket.on("call:offer", async (data = {}, acknowledge = () => {}) => {
      const target=validId(data.targetUserId), offer=data.offer;
      if(!target||target===userId||!offer||typeof offer!=="object"||Array.isArray(offer)) return acknowledge({ok:false,error:"Invalid call offer."});
      if(!roomHasSockets("user:"+target)) return acknowledge({ok:false,error:"Recipient is not connected."});
      try { const state=await callState.startDirectCall({callerId:userId,targetId:target,callerUsername:socket.data.username,targetUsername:onlineUsers.get(target)||"User",serverId,socketId:socket.id}); if(!state.ok)return acknowledge(state); startCallHeartbeat(); emitToUser(target,"call:incoming",{callerId:userId,callerUsername:socket.data.username,offer}); return acknowledge({ok:true}); }
      catch { return acknowledge({ok:false,error:"Could not start the shared direct call."}); }
    });
    socket.on("call:answer", async (data = {}, acknowledge = () => {}) => {
      const target=validId(data.targetUserId), answer=data.answer;
      if(!target||!answer||typeof answer!=="object"||Array.isArray(answer)) return acknowledge({ok:false,error:"Call answer is not authorized."});
      try { const accepted=await callState.acceptDirectCall({userId,otherUserId:target,serverId,socketId:socket.id}); if(!accepted.ok)return acknowledge(accepted); startCallHeartbeat(); emitToUser(target,"call:accepted",{recipientId:userId,recipientUsername:socket.data.username,answer}); return acknowledge({ok:true}); }
      catch { return acknowledge({ok:false,error:"Could not accept the shared direct call."}); }
    });
    socket.on("call:ice-candidate", async data => {
      const target=validId(data?.targetUserId), candidate=data?.candidate; if(!target||!candidate||typeof candidate!=="object"||Array.isArray(candidate))return;
      try { const auth=await callState.authorizeDirectCall({userId,targetId:target,serverId,socketId:socket.id}); if(auth.ok)emitToUser(target,"call:ice-candidate",{senderId:userId,candidate}); } catch {}
    });

    socket.on("call:caption", async (data = {}, acknowledge = () => {}) => {
      const target = validId(data.targetUserId);
      const caption = typeof data.text === "string" ? data.text.trim() : "";
      if (!target || target === userId) {
        return acknowledge({ ok: false, error: "Live captions are not authorized for this call." });
      }
      try { const auth=await callState.authorizeDirectCall({userId,targetId:target,serverId,socketId:socket.id}); if(!auth.ok)return acknowledge({ok:false,error:"Live captions are not authorized for this call."}); } catch { return acknowledge({ok:false,error:"Could not verify the shared direct call."}); }
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


    socket.on("call:end", async data => { const target=validId(data?.targetUserId); if(!target)return; try { const ended=await callState.endDirectCall({userId,targetId:target}); if(ended.ok){emitToUser(target,"call:ended",{senderId:userId});socket.emit("call:ended",{senderId:target});} } catch {} });
    socket.on("call:recovery-request", async (data = {}, acknowledge = () => {}) => {
      const target=validId(data.targetUserId); if(!target||target===userId)return acknowledge({ok:false,error:"There is no active call to recover."});
      try { const joined=await callState.acceptDirectCall({userId,otherUserId:target,serverId,socketId:socket.id}); if(!joined.ok)return acknowledge({ok:false,error:"There is no active call to recover."}); if(!roomHasSockets("user:"+target))return acknowledge({ok:false,error:"The other participant is no longer connected."}); startCallHeartbeat(); emitToUser(target,"call:recovery-requested",{senderId:userId}); return acknowledge({ok:true}); } catch { return acknowledge({ok:false,error:"Could not recover the shared direct call."}); }
    });
    socket.on("call:recovery-offer", async (data = {}, acknowledge = () => {}) => {
      const target=validId(data.targetUserId), offer=data.offer; if(!target||!offer||typeof offer!=="object"||Array.isArray(offer))return acknowledge({ok:false,error:"Call recovery offer is not authorized."});
      try { const auth=await callState.authorizeDirectCall({userId,targetId:target,serverId,socketId:socket.id}); if(!auth.ok)return acknowledge({ok:false,error:"Call recovery offer is not authorized."}); emitToUser(target,"call:recovery-offer",{senderId:userId,offer}); return acknowledge({ok:true}); } catch { return acknowledge({ok:false,error:"Could not verify the shared direct call."}); }
    });
    socket.on("call:recovery-answer", async (data = {}, acknowledge = () => {}) => {
      const target=validId(data.targetUserId), answer=data.answer; if(!target||!answer||typeof answer!=="object"||Array.isArray(answer))return acknowledge({ok:false,error:"Call recovery answer is not authorized."});
      try { const auth=await callState.authorizeDirectCall({userId,targetId:target,serverId,socketId:socket.id}); if(!auth.ok)return acknowledge({ok:false,error:"Call recovery answer is not authorized."}); emitToUser(target,"call:recovery-answer",{senderId:userId,answer}); return acknowledge({ok:true}); } catch { return acknowledge({ok:false,error:"Could not verify the shared direct call."}); }
    });

    // Group-call membership and authorization are durable PostgreSQL state.
    // Socket.IO rooms distribute signaling across instances; media remains P2P.
    const groupCallMembership = new Set();
    let callHeartbeat = null;
    function startCallHeartbeat() {
      if (callHeartbeat) return;
      callHeartbeat = setInterval(() => {
        callState.heartbeat({ serverId, socketId: socket.id }).then(active => {
          if (active) return;
          clearInterval(callHeartbeat);
          callHeartbeat = null;
          groupCallMembership.clear();
        }).catch(error => {
          console.error("PostgreSQL call heartbeat failed:", error?.message || "Unknown error");
        });
      }, 15000);
      callHeartbeat.unref?.();
    }
    function stopCallHeartbeatIfIdle() {
      if (groupCallMembership.size || !callHeartbeat) return;
      clearInterval(callHeartbeat);
      callHeartbeat = null;
    }
    async function getAuthorizedGroupCall(groupId) {
      const status = await callState.getGroupCallStatus({ groupId, userId });
      return status?.ok && status.active ? status : null;
    }
    function emitGroupCallEnded(groupId, reason) {
      io.to("group-call:" + groupId).emit("group-call:ended", { groupId, reason });
      io.to("group:" + groupId).emit("group-call:ended", { groupId, reason });
      io.in("group-call:" + groupId).socketsLeave("group-call:" + groupId);
    }

    socket.on("group-call:start", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        const result = await callState.startGroupCall({
          groupId, userId, username: socket.data.username, serverId, socketId: socket.id
        });
        if (!result.ok) return acknowledge(result);
        groupCallMembership.add(groupId);
        startCallHeartbeat();
        await socket.join("group-call:" + groupId);
        io.to("group:" + groupId).emit("group-call:available", {
          groupId, hostId: userId, hostUsername: socket.data.username
        });
        return acknowledge({ ok: true, groupId, participants: [{ userId, username: socket.data.username }] });
      } catch {
        return acknowledge({ ok: false, error: "Could not start the shared PostgreSQL group call." });
      }
    });

    socket.on("group-call:status", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try { return acknowledge(await callState.getGroupCallStatus({ groupId, userId })); }
      catch { return acknowledge({ ok: false, error: "Could not retrieve shared group-call status." }); }
    });

    socket.on("group-call:join", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        const result = await callState.joinGroupCall({
          groupId, userId, username: socket.data.username, serverId, socketId: socket.id
        });
        if (!result.ok) return acknowledge(result);
        groupCallMembership.add(groupId);
        startCallHeartbeat();
        await socket.join("group-call:" + groupId);
        const status = await callState.getGroupCallStatus({ groupId, userId });
        if (!status.ok || !status.active) {
          await callState.leaveSession({ serverId, socketId: socket.id });
          groupCallMembership.delete(groupId);
          stopCallHeartbeatIfIdle();
          await socket.leave("group-call:" + groupId);
          return acknowledge({ ok: false, error: "The group call is no longer active." });
        }
        if (!result.additionalSession) {
          socket.to("group-call:" + groupId).emit("group-call:participant-joined", {
            groupId, userId, username: socket.data.username
          });
        }
        socket.emit("group-call:participants", { groupId, participants: status.participants || [] });
        return acknowledge({
          ok: true, groupId, participants: status.participants || [],
          additionalSession: Boolean(result.additionalSession)
        });
      } catch { return acknowledge({ ok: false, error: "Could not join the shared PostgreSQL group call." }); }
    });

    for (const eventName of ["group-call:offer", "group-call:answer", "group-call:ice-candidate"]) {
      socket.on(eventName, async (data = {}, acknowledge = () => {}) => {
        const groupId = validId(data.groupId), target = validId(data.targetUserId);
        const payload = eventName === "group-call:ice-candidate" ? data.candidate : data.description;
        if (!groupId || !target || target === userId ||
            !payload || typeof payload !== "object" || Array.isArray(payload)) {
          return acknowledge({ ok: false, error: "Group-call signaling is not authorized." });
        }
        try {
          const status = await getAuthorizedGroupCall(groupId);
          const ids = new Set((status?.participants || []).map(p => String(p.userId)));
          if (!ids.has(userId) || !ids.has(target)) {
            return acknowledge({ ok: false, error: "Both users must be active participants in this group call." });
          }
          emitToUser(target, eventName, {
            groupId, senderId: userId, senderUsername: socket.data.username,
            ...(eventName === "group-call:ice-candidate" ? { candidate: payload } : { description: payload })
          });
          return acknowledge({ ok: true });
        } catch { return acknowledge({ ok: false, error: "Could not verify shared group-call participants." }); }
      });
    }

    socket.on("group-call:hand-raise", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId || typeof data.raised !== "boolean") return acknowledge({ ok: false, error: "Invalid hand-raise request." });
      try {
        const result = await callState.setHandRaised({
          groupId, userId, serverId, socketId: socket.id, raised: data.raised
        });
        if (!result.ok) return acknowledge(result);
        io.to("group-call:" + groupId).emit("group-call:hand-raised", {
          groupId, userId, username: socket.data.username, raised: result.raised
        });
        return acknowledge({ ok: true, raised: result.raised });
      } catch { return acknowledge({ ok: false, error: "Could not update shared hand-raise state." }); }
    });

    socket.on("group-call:moderate", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId), target = validId(data.targetUserId);
      const action = String(data.action || "");
      if (!groupId || !target || target === userId ||
          !["remove", "lower-hand", "request-mute"].includes(action)) {
        return acknowledge({ ok: false, error: "This moderation action is not available for the current call." });
      }
      try {
        const result = await callState.moderateGroupCall({ groupId, actorUserId: userId, targetUserId: target, action });
        if (!result.ok) return acknowledge(result);
        if (action === "remove") {
          emitToUser(target, "group-call:removed", { groupId, reason: "removed-by-moderator" });
          io.in("user:" + target).socketsLeave("group-call:" + groupId);
          io.to("group-call:" + groupId).emit("group-call:participant-left", {
            groupId, userId: target, username: result.targetUsername, reason: "removed"
          });
        } else if (action === "lower-hand") {
          io.to("group-call:" + groupId).emit("group-call:hand-raised", {
            groupId, userId: target, username: result.targetUsername, raised: false
          });
        } else {
          emitToUser(target, "group-call:mute-request", { groupId, requestedBy: socket.data.username });
        }
        return acknowledge({ ok: true, action, targetUserId: target });
      } catch { return acknowledge({ ok: false, error: "Could not verify shared group-call moderator permissions." }); }
    });

    socket.on("group-call:leave", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId || !groupCallMembership.has(groupId)) {
        return acknowledge({ ok: false, error: "This device is not in that group call." });
      }
      try {
        const result = await callState.leaveSession({ serverId, socketId: socket.id });
        groupCallMembership.delete(groupId);
        await socket.leave("group-call:" + groupId);
        stopCallHeartbeatIfIdle();
        if (result.participantLeft) io.to("group-call:" + groupId).emit("group-call:participant-left", {
          groupId, userId, username: socket.data.username
        });
        if (result.callEnded) emitGroupCallEnded(groupId, "host-disconnected");
        return acknowledge({ ok: true });
      } catch { return acknowledge({ ok: false, error: "Could not leave the shared PostgreSQL group call." }); }
    });

    socket.on("group-call:end", async (data = {}, acknowledge = () => {}) => {
      const groupId = validId(data.groupId);
      if (!groupId) return acknowledge({ ok: false, error: "Invalid group." });
      try {
        const result = await callState.endGroupCall({ groupId, userId });
        if (!result.ok) return acknowledge(result);
        emitGroupCallEnded(groupId, "host-ended");
        return acknowledge({ ok: true });
      } catch { return acknowledge({ ok: false, error: "Could not end the shared PostgreSQL group call." }); }
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
      if (callHeartbeat) { clearInterval(callHeartbeat); callHeartbeat = null; }
      for (const groupId of socket.data.typingGroups) {
        socket.to("group:" + groupId).emit("group:typing:update", {
          groupId, userId, username: socket.data.username, isTyping: false
        });
      }
      socket.data.typingGroups.clear();
      for (const groupId of Array.from(groupCallMembership)) {
        try {
          const result = await callState.leaveSession({ serverId, socketId: socket.id });
          groupCallMembership.delete(groupId);
          if (result.participantLeft) io.to("group-call:" + groupId).emit("group-call:participant-left", {
            groupId, userId, username: socket.data.username
          });
          if (result.callEnded) emitGroupCallEnded(groupId, "host-disconnected");
        } catch (error) {
          console.error("PostgreSQL shared call disconnect cleanup failed:", error?.message || "Unknown error");
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
