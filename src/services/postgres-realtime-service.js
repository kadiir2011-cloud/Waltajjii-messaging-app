"use strict";
function createPostgresRealtimeService({ db } = {}) {
  if (!db || typeof db.many !== "function" || typeof db.one !== "function" || typeof db.execute !== "function") {
    throw new TypeError("A PostgreSQL adapter with many(), one(), and execute() is required.");
  }
  async function getOnlineProfiles(onlineUserIds, viewerUserId) {
    const ids = [...new Set((onlineUserIds || []).map(String))].filter(id => id && id !== String(viewerUserId));
    if (!ids.length) return [];
    return db.many(`
      SELECT id AS "userId", COALESCE(NULLIF(full_name, ''), 'Waltajjii member') AS "fullName",
        avatar_path AS "avatarPath",
        CASE WHEN profile_mode IN ('professional','both') THEN professional_title ELSE '' END AS "professionalTitle",
        CASE WHEN profile_mode IN ('professional','both') THEN organization ELSE '' END AS organization
      FROM users WHERE id = ANY($1::bigint[])
      ORDER BY LOWER(COALESCE(full_name, '')), LOWER(username)
    `, [ids]);
  }
  async function listGroupIdsForUser(userId) {
    const rows = await db.many("SELECT group_id AS \"groupId\" FROM group_members WHERE user_id = $1", [userId]);
    return rows.map(row => row.groupId);
  }
  async function isGroupMember(groupId, userId) {
    return Boolean(await db.one("SELECT 1 AS member FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]));
  }
  async function markMessageDelivered(messageId, recipientId) {
    const updated = await db.one(`
      UPDATE messages SET delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
      WHERE id = $1 AND receiver_id = $2 RETURNING id
    `, [messageId, recipientId]);
    if (!updated) return null;
    return db.one(`
      SELECT m.id AS "messageId", m.sender_id AS "senderId", m.receiver_id AS "receiverId",
        s.username AS sender, r.username AS recipient, m.delivered_at AS "deliveredAt", m.read_at AS "readAt"
      FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.receiver_id
      WHERE m.id = $1
    `, [messageId]);
  }
  return Object.freeze({ getOnlineProfiles, listGroupIdsForUser, isGroupMember, markMessageDelivered });
}
module.exports = { createPostgresRealtimeService };
