"use strict";

function createPostgresCallStateService({ db, clock = () => new Date(), leaseMs = 45000 } = {}) {
  if (!db || typeof db.withTransaction !== "function" || typeof db.one !== "function") {
    throw new TypeError("A transactional PostgreSQL adapter is required.");
  }
  if (typeof clock !== "function" || !Number.isInteger(leaseMs) || leaseMs < 10000) {
    throw new TypeError("A clock and lease duration of at least 10 seconds are required.");
  }
  const now = () => new Date(clock());
  const iso = value => new Date(value).toISOString();
  const leaseUntil = () => new Date(now().getTime() + leaseMs);
  const validId = value => /^[1-9][0-9]*$/.test(String(value ?? "")) ? String(value) : null;
  const activeDevice = "disconnected_at IS NULL AND lease_expires_at > $1";

  async function expireCallLeases(tx, callId, at) {
    await tx.execute(
      "UPDATE realtime_call_device_sessions SET disconnected_at = $2 WHERE call_id = $1 AND disconnected_at IS NULL AND lease_expires_at <= $2",
      [callId, at]
    );
    await tx.execute(
      `UPDATE realtime_call_participants p
       SET left_at = $2
       WHERE p.call_id = $1 AND p.left_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM realtime_call_device_sessions d
           WHERE d.call_id = p.call_id AND d.user_id = p.user_id
             AND d.disconnected_at IS NULL AND d.lease_expires_at > $2
         )`,
      [callId, at]
    );
    const call = await tx.one("SELECT host_user_id, status FROM realtime_call_sessions WHERE id = $1 FOR UPDATE", [callId]);
    if (!call || call.status !== "active") return;
    const host = await tx.one(
      "SELECT 1 AS active FROM realtime_call_participants WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL",
      [callId, call.host_user_id]
    );
    const count = await tx.one(
      "SELECT COUNT(*)::int AS count FROM realtime_call_participants WHERE call_id = $1 AND left_at IS NULL",
      [callId]
    );
    if (!host || Number(count?.count || 0) === 0) {
      await tx.execute(
        "UPDATE realtime_call_sessions SET status='ended', ended_at=$2 WHERE id=$1 AND status='active'",
        [callId, at]
      );
    }
  }

  async function expireUserLeases(tx, userId, at) {
    const rows = await tx.many(
      "SELECT DISTINCT call_id FROM realtime_call_device_sessions WHERE user_id=$1 AND disconnected_at IS NULL AND lease_expires_at <= $2",
      [userId, at]
    );
    for (const row of rows) await expireCallLeases(tx, row.call_id, at);
  }

  async function createDeviceSession(tx, callId, userId, serverId, socketId, at) {
    const expiry = leaseUntil();
    await tx.execute(
      `INSERT INTO realtime_call_device_sessions
       (call_id,user_id,server_id,socket_id,last_seen_at,lease_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [callId, userId, serverId, socketId, at, expiry]
    );
    await tx.execute(
      "UPDATE realtime_call_participants SET last_seen_at=$3, lease_expires_at=$4 WHERE call_id=$1 AND user_id=$2",
      [callId, userId, at, expiry]
    );
  }

  async function startGroupCall({ groupId, userId, username, serverId, socketId }) {
    groupId = validId(groupId); userId = validId(userId);
    if (!groupId || !userId || !username || !serverId || !socketId) {
      return { ok: false, error: "Invalid call identity." };
    }
    const at = now();
    try {
      return await db.withTransaction(async tx => {
        await tx.one("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [groupId]);
        const member = await tx.one("SELECT 1 AS member FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId,userId]);
        if (!member) return { ok: false, error: "Only current group members can start a call." };
        await expireUserLeases(tx, userId, at);
        const occupied = await tx.one(
          "SELECT call_id FROM realtime_call_participants WHERE user_id=$1 AND left_at IS NULL FOR UPDATE",
          [userId]
        );
        if (occupied) return { ok: false, error: "You are already in an active call." };
        const existing = await tx.one(
          "SELECT id FROM realtime_call_sessions WHERE group_id=$1 AND call_type='group' AND status='active' FOR UPDATE",
          [groupId]
        );
        if (existing) return { ok: false, error: "A group call is already active." };
        const expiry = new Date(at.getTime() + leaseMs);
        const call = await tx.one(
          "INSERT INTO realtime_call_sessions(call_type,group_id,host_user_id,expires_at) VALUES('group',$1,$2,$3) RETURNING id",
          [groupId,userId,expiry]
        );
        await tx.execute(
          "INSERT INTO realtime_call_participants(call_id,user_id,username,participant_role,last_seen_at,lease_expires_at) VALUES($1,$2,$3,'host',$4,$5)",
          [call.id,userId,username,at,expiry]
        );
        await createDeviceSession(tx,call.id,userId,serverId,socketId,at);
        return { ok: true, callId: String(call.id), groupId, hostId: userId, participantCount: 1 };
      });
    } catch (error) {
      if (error?.code === "23505") return { ok: false, error: "You or this group already has an active call." };
      throw error;
    }
  }

  async function joinGroupCall({ groupId, userId, username, serverId, socketId }) {
    groupId = validId(groupId); userId = validId(userId);
    if (!groupId || !userId || !username || !serverId || !socketId) {
      return { ok: false, error: "Invalid call identity." };
    }
    const at = now();
    try {
      return await db.withTransaction(async tx => {
        await tx.one("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [groupId]);
        const member = await tx.one("SELECT 1 AS member FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId,userId]);
        if (!member) return { ok: false, error: "You are not a current group member." };
        await expireUserLeases(tx, userId, at);
        const call = await tx.one(
          "SELECT id,host_user_id FROM realtime_call_sessions WHERE group_id=$1 AND call_type='group' AND status='active' FOR UPDATE",
          [groupId]
        );
        if (!call) return { ok: false, error: "No active group call is available." };
        await expireCallLeases(tx,call.id,at);
        const freshCall = await tx.one("SELECT id,host_user_id,status FROM realtime_call_sessions WHERE id=$1 FOR UPDATE",[call.id]);
        if (!freshCall || freshCall.status !== "active") return { ok: false, error: "The group call has ended." };
        const existing = await tx.one(
          "SELECT call_id FROM realtime_call_participants WHERE user_id=$1 AND left_at IS NULL FOR UPDATE",
          [userId]
        );
        if (existing && String(existing.call_id) !== String(call.id)) return { ok: false, error: "You are already in another call." };
        const participant = await tx.one(
          "SELECT user_id FROM realtime_call_participants WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE",
          [call.id,userId]
        );
        if (!participant) {
          const count = await tx.one(
            "SELECT COUNT(*)::int AS count FROM realtime_call_participants WHERE call_id=$1 AND left_at IS NULL",
            [call.id]
          );
          if (Number(count?.count || 0) >= 8) return { ok: false, error: "This group call has reached its 8-person limit." };
          const expiry = new Date(at.getTime() + leaseMs);
          await tx.execute(
            "INSERT INTO realtime_call_participants(call_id,user_id,username,participant_role,last_seen_at,lease_expires_at) VALUES($1,$2,$3,'member',$4,$5)",
            [call.id,userId,username,at,expiry]
          );
        }
        await createDeviceSession(tx,call.id,userId,serverId,socketId,at);
        const count = await tx.one(
          "SELECT COUNT(*)::int AS count FROM realtime_call_participants WHERE call_id=$1 AND left_at IS NULL",
          [call.id]
        );
        return { ok: true, callId: String(call.id), groupId, additionalSession: Boolean(participant), participantCount: Number(count.count) };
      });
    } catch (error) {
      if (error?.code === "23505") return { ok: false, error: "A concurrent call start or join changed the call state. Please retry." };
      throw error;
    }
  }

  async function heartbeat({ serverId, socketId }) {
    if (!serverId || !socketId) return false;
    const at = now(), expiry = leaseUntil();
    return db.withTransaction(async tx => {
      const session = await tx.one(
        "UPDATE realtime_call_device_sessions SET last_seen_at=$3,lease_expires_at=$4 WHERE server_id=$1 AND socket_id=$2 AND disconnected_at IS NULL RETURNING call_id,user_id",
        [serverId,socketId,at,expiry]
      );
      if (!session) return false;
      await tx.execute(
        "UPDATE realtime_call_participants SET last_seen_at=$3,lease_expires_at=$4 WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL",
        [session.call_id,session.user_id,at,expiry]
      );
      return true;
    });
  }

  async function leaveSession({ serverId, socketId }) {
    if (!serverId || !socketId) return { ok: false };
    const at = now();
    return db.withTransaction(async tx => {
      const session = await tx.one(
        "SELECT d.call_id,d.user_id,c.group_id FROM realtime_call_device_sessions d JOIN realtime_call_sessions c ON c.id=d.call_id WHERE d.server_id=$1 AND d.socket_id=$2 AND d.disconnected_at IS NULL FOR UPDATE OF d",
        [serverId,socketId]
      );
      if (!session) return { ok: true, alreadyLeft: true };
      await tx.execute(
        "UPDATE realtime_call_device_sessions SET disconnected_at=$3 WHERE server_id=$1 AND socket_id=$2 AND disconnected_at IS NULL",
        [serverId,socketId,at]
      );
      const remaining = await tx.one(
        "SELECT 1 AS active FROM realtime_call_device_sessions WHERE call_id=$1 AND user_id=$2 AND disconnected_at IS NULL AND lease_expires_at>$3 LIMIT 1",
        [session.call_id,session.user_id,at]
      );
      if (!remaining) {
        await tx.execute(
          "UPDATE realtime_call_participants SET left_at=$3 WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL",
          [session.call_id,session.user_id,at]
        );
      }
      await expireCallLeases(tx,session.call_id,at);
      const call = await tx.one("SELECT status FROM realtime_call_sessions WHERE id=$1",[session.call_id]);
      return { ok: true, callId: String(session.call_id), groupId: session.group_id == null ? null : String(session.group_id), userId: String(session.user_id), participantLeft: !remaining, callEnded: call?.status === "ended" };
    });
  }

  async function getGroupCallStatus({ groupId, userId }) {
    groupId = validId(groupId); userId = validId(userId);
    if (!groupId || !userId) return { ok: false, error: "Invalid group." };
    const member = await db.one("SELECT 1 AS member FROM group_members WHERE group_id=$1 AND user_id=$2",[groupId,userId]);
    if (!member) return { ok: false, error: "You are not a current member of this group." };
    return db.withTransaction(async tx => {
      const call = await tx.one(
        "SELECT id,host_user_id,status FROM realtime_call_sessions WHERE group_id=$1 AND call_type='group' AND status='active'",
        [groupId]
      );
      if (!call) return { ok: true, groupId, active: false, participantCount: 0 };
      await expireCallLeases(tx,call.id,now());
      const current = await tx.one("SELECT id,host_user_id,status FROM realtime_call_sessions WHERE id=$1",[call.id]);
      if (!current || current.status !== "active") return { ok: true, groupId, active: false, participantCount: 0 };
      const count = await tx.one("SELECT COUNT(*)::int AS count FROM realtime_call_participants WHERE call_id=$1 AND left_at IS NULL",[call.id]);
      const host = await tx.one("SELECT username FROM realtime_call_participants WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL",[call.id,current.host_user_id]);
      const participants = await tx.many(
        "SELECT p.user_id AS \"userId\",p.username,p.participant_role AS \"participantRole\",p.hand_raised AS \"handRaised\" FROM realtime_call_participants p WHERE p.call_id=$1 AND p.left_at IS NULL AND EXISTS (SELECT 1 FROM realtime_call_device_sessions d WHERE d.call_id=p.call_id AND d.user_id=p.user_id AND d.disconnected_at IS NULL AND d.lease_expires_at>$2) ORDER BY p.joined_at",
        [call.id,now()]
      );
      return { ok: true, groupId, active: true, callId: String(call.id), hostId: String(current.host_user_id), hostUsername: host?.username || null, participantCount: Number(count.count), participants: participants.map(p => ({ userId: String(p.userId), username: p.username, participantRole: p.participantRole, handRaised: Boolean(p.handRaised) })) };
    });
  }

  async function endGroupCall({ groupId, userId }) {
    groupId = validId(groupId); userId = validId(userId);
    if (!groupId || !userId) return { ok: false, error: "Invalid call identity." };
    return db.withTransaction(async tx => {
      const call = await tx.one(
        "SELECT id,host_user_id FROM realtime_call_sessions WHERE group_id=$1 AND call_type='group' AND status='active' FOR UPDATE",
        [groupId]
      );
      if (!call || String(call.host_user_id) !== userId) return { ok: false, error: "Only the call host can end this call." };
      await tx.execute("UPDATE realtime_call_sessions SET status='ended',ended_at=$2,ended_by=$3 WHERE id=$1",[call.id,now(),userId]);
      await tx.execute("UPDATE realtime_call_participants SET left_at=$2 WHERE call_id=$1 AND left_at IS NULL",[call.id,now()]);
      await tx.execute("UPDATE realtime_call_device_sessions SET disconnected_at=$2 WHERE call_id=$1 AND disconnected_at IS NULL",[call.id,now()]);
      return { ok: true, callId: String(call.id), groupId: String(groupId) };
    });
  }

  async function setHandRaised({ groupId, userId, serverId, socketId, raised }) {
    groupId = validId(groupId); userId = validId(userId);
    if (!groupId || !userId || !serverId || !socketId || typeof raised !== "boolean") {
      return { ok: false, error: "Invalid hand-raise request." };
    }
    return db.withTransaction(async tx => {
      const call = await tx.one("SELECT id FROM realtime_call_sessions WHERE group_id=$1 AND call_type='group' AND status='active' FOR UPDATE",[groupId]);
      if (!call) return { ok: false, error: "No active group call is available." };
      const member = await tx.one("SELECT 1 AS member FROM group_members WHERE group_id=$1 AND user_id=$2",[groupId,userId]);
      if (!member) return { ok: false, error: "You are no longer a member of this group." };
      const session = await tx.one(
        "SELECT 1 AS active FROM realtime_call_device_sessions WHERE call_id=$1 AND user_id=$2 AND server_id=$3 AND socket_id=$4 AND disconnected_at IS NULL AND lease_expires_at>$5",
        [call.id,userId,serverId,socketId,now()]
      );
      if (!session) return { ok: false, error: "This device is not an active call participant." };
      await tx.execute("UPDATE realtime_call_participants SET hand_raised=$3 WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL",[call.id,userId,raised]);
      return { ok: true, raised };
    });
  }

  async function moderateGroupCall({ groupId, actorUserId, targetUserId, action }) {
    groupId = validId(groupId); actorUserId = validId(actorUserId); targetUserId = validId(targetUserId);
    if (!groupId || !actorUserId || !targetUserId || actorUserId === targetUserId ||
        !["remove","lower-hand","request-mute"].includes(action)) {
      return { ok: false, error: "Invalid moderation request." };
    }
    return db.withTransaction(async tx => {
      const call = await tx.one("SELECT id,host_user_id FROM realtime_call_sessions WHERE group_id=$1 AND call_type='group' AND status='active' FOR UPDATE",[groupId]);
      if (!call) return { ok: false, error: "No active group call is available." };
      const actor = await tx.one("SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2",[groupId,actorUserId]);
      const target = await tx.one("SELECT username FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.user_id=$2",[groupId,targetUserId]);
      if (!actor || !target) return { ok: false, error: "A participant is no longer a group member." };
      if (String(call.host_user_id) !== actorUserId && actor.role !== "admin") {
        return { ok: false, error: "Only the call host or a group admin can moderate participants." };
      }
      const participant = await tx.one("SELECT 1 AS active FROM realtime_call_participants WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE",[call.id,targetUserId]);
      if (!participant) return { ok: false, error: "The target is not an active call participant." };
      if (action === "remove") {
        if (String(call.host_user_id) === targetUserId) return { ok: false, error: "The call host cannot be removed." };
        const at = now();
        await tx.execute("UPDATE realtime_call_participants SET left_at=$3,hand_raised=FALSE WHERE call_id=$1 AND user_id=$2",[call.id,targetUserId,at]);
        await tx.execute("UPDATE realtime_call_device_sessions SET disconnected_at=$3 WHERE call_id=$1 AND user_id=$2 AND disconnected_at IS NULL",[call.id,targetUserId,at]);
      } else if (action === "lower-hand") {
        await tx.execute("UPDATE realtime_call_participants SET hand_raised=FALSE WHERE call_id=$1 AND user_id=$2",[call.id,targetUserId]);
      }
      return { ok: true, action, targetUserId, targetUsername: target.username, hostId: String(call.host_user_id) };
    });
  }

  return Object.freeze({
    startGroupCall, joinGroupCall, heartbeat, leaveSession, getGroupCallStatus,
    endGroupCall, setHandRaised, moderateGroupCall
  });
}
module.exports = { createPostgresCallStateService };
