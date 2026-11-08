const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Login required." });
  }
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "waltajjii",
      audience: "waltajjii-users"
    });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired login token." });
  }
}

function membership(groupId, userId) {
  return db.prepare(
    "SELECT role FROM group_members WHERE group_id = ? AND user_id = ?"
  ).get(groupId, userId);
}

function isAdmin(groupId, userId) {
  const member = membership(groupId, userId);
  return member && member.role === "admin";
}

router.use(authenticate);

// List only groups the signed-in user belongs to.
router.get("/", (req, res) => {
  const groups = db.prepare(`
    SELECT g.id, g.name, g.created_by AS createdBy, g.created_at AS createdAt,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS memberCount,
      (SELECT gm.role FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = ?) AS myRole,
      (SELECT COUNT(*) FROM group_messages msg
        LEFT JOIN group_message_receipts receipt
          ON receipt.group_message_id = msg.id AND receipt.user_id = mine.user_id
        WHERE msg.group_id = g.id AND msg.sender_id != mine.user_id
          AND datetime(msg.created_at) >= datetime(mine.joined_at)
          AND receipt.read_at IS NULL) AS unreadCount
    FROM groups g
    JOIN group_members mine ON mine.group_id = g.id
    WHERE mine.user_id = ?
    ORDER BY g.id DESC
  `).all(req.auth.userId, req.auth.userId);
  res.json({ groups });
});

router.post("/", (req, res) => {
  const name = String(req.body.name || "").trim();
  const usernames = Array.isArray(req.body.memberUsernames)
    ? [...new Set(req.body.memberUsernames.map(v => String(v).trim()).filter(Boolean))]
    : [];

  if (!name || name.length > 80) {
    return res.status(400).json({ error: "Group name must be 1–80 characters." });
  }
  if (usernames.length > 99) {
    return res.status(400).json({ error: "A group can have at most 100 members including you." });
  }

  const users = usernames.length
    ? db.prepare(`SELECT id, username FROM users WHERE username IN (${usernames.map(() => "?").join(",")})`).all(...usernames)
    : [];
  if (users.length !== usernames.length) {
    return res.status(400).json({ error: "One or more member usernames were not found." });
  }

  const create = db.transaction(() => {
    const result = db.prepare("INSERT INTO groups (name, created_by) VALUES (?, ?)").run(name, req.auth.userId);
    const groupId = result.lastInsertRowid;
    const add = db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)");
    add.run(groupId, req.auth.userId, "admin");
    for (const user of users) add.run(groupId, user.id, "member");
    return groupId;
  });

  const groupId = create();
  const io = req.app.get("io");
  if (io) {
    const memberIds = [req.auth.userId, ...users.map(user => user.id)];
    memberIds.forEach(userId => {
      io.in(`user:${userId}`).socketsJoin(`group:${groupId}`);
      io.to(`user:${userId}`).emit("groups:updated", { groupId });
    });
  }
  res.status(201).json({ group: db.prepare("SELECT id, name, created_by AS createdBy, created_at AS createdAt FROM groups WHERE id = ?").get(groupId) });
});

router.get("/:id/members", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) {
    return res.status(404).json({ error: "Group not found." });
  }
  const members = db.prepare(`
    SELECT u.id, u.username, gm.role, gm.joined_at AS joinedAt
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? ORDER BY CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END, u.username
  `).all(groupId);
  res.json({ members, canManage: Boolean(isAdmin(groupId, req.auth.userId)) });
});

router.post("/:id/members", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can add members." });
  }
  const username = String(req.body.username || "").trim();
  if (!username) return res.status(400).json({ error: "Enter a username." });
  const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (!user) return res.status(404).json({ error: "User not found." });
  const count = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?").get(groupId).n;
  if (count >= 100) return res.status(400).json({ error: "This group has reached 100 members." });
  try {
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(groupId, user.id);
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That user is already a member." });
    }
    throw e;
  }
  const io = req.app.get("io");
  if (io) {
    io.in(`user:${user.id}`).socketsJoin(`group:${groupId}`);
    io.to(`user:${user.id}`).emit("groups:updated", { groupId });
    io.to(`group:${groupId}`).emit("group:members:updated", { groupId });
  }
  res.status(201).json({ message: "Member added." });
});

router.delete("/:id/members/:userId", (req, res) => {
  const groupId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(userId) || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can remove members." });
  }
  if (userId === req.auth.userId) {
    return res.status(400).json({ error: "An admin cannot remove themselves. Assign another admin first (admin transfer is not yet available)." });
  }
  const result = db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, userId);
  if (!result.changes) return res.status(404).json({ error: "Member not found." });
  const io = req.app.get("io");
  if (io) {
    io.to(`group:${groupId}`).emit("group:members:updated", { groupId });
    io.in(`user:${userId}`).socketsLeave(`group:${groupId}`);
    io.to(`user:${userId}`).emit("groups:updated", { groupId, removed: true });
  }
  res.json({ message: "Member removed." });
});


function groupMessageFor(groupId, messageId, viewerId) {
  const message = db.prepare(`
    SELECT gm.id, gm.group_id AS groupId, gm.sender_id AS senderId,
      u.username AS sender, gm.body,
      CASE WHEN gm.deleted_at IS NOT NULL THEN NULL ELSE gm.media_path END AS mediaPath,
      CASE WHEN gm.deleted_at IS NOT NULL THEN NULL ELSE gm.media_type END AS mediaType,
      gm.reply_to_message_id AS replyToMessageId,
      reply.body AS replyToBody, replyUser.username AS replyToSender,
      gm.edited_at AS editedAt, gm.deleted_at AS deletedAt,
      gm.is_announcement AS isAnnouncement, gm.pinned_at AS pinnedAt,
      gm.pinned_by AS pinnedBy, pinUser.username AS pinnedByUsername,
      gm.created_at AS createdAt
    FROM group_messages gm
    JOIN users u ON u.id = gm.sender_id
    LEFT JOIN users pinUser ON pinUser.id = gm.pinned_by
    LEFT JOIN group_messages reply ON reply.id = gm.reply_to_message_id
    LEFT JOIN users replyUser ON replyUser.id = reply.sender_id
    WHERE gm.group_id = ? AND gm.id = ?
  `).get(groupId, messageId);
  if (!message) return null;
  message.body = message.deletedAt ? "This message was deleted" : message.body;
  message.reactions = db.prepare(`
    SELECT emoji, COUNT(*) AS count,
      MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reactedByMe
    FROM group_message_reactions WHERE group_message_id = ?
    GROUP BY emoji ORDER BY emoji
  `).all(viewerId, messageId).map(r => ({...r, reactedByMe: Boolean(r.reactedByMe)}));
  message.receipts = db.prepare(`
    SELECT u.id AS userId, u.username,
      receipt.delivered_at AS deliveredAt, receipt.read_at AS readAt
    FROM group_message_receipts receipt
    JOIN users u ON u.id = receipt.user_id
    WHERE receipt.group_message_id = ?
    ORDER BY u.username
  `).all(messageId);
  return message;
}

router.get("/:id/messages", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) {
    return res.status(404).json({ error: "Group not found." });
  }
  // Opening a group marks only messages sent after this member joined as read.
  const readUpdate = db.prepare(`
    UPDATE group_message_receipts
    SET delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
        read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ? AND group_message_id IN (
      SELECT gm.id FROM group_messages gm
      JOIN group_members member ON member.group_id = gm.group_id
      WHERE gm.group_id = ? AND gm.sender_id != ?
        AND datetime(gm.created_at) >= datetime(member.joined_at)
        AND member.user_id = ?
    )
      AND read_at IS NULL
  `).run(req.auth.userId, groupId, req.auth.userId, req.auth.userId);
  if (readUpdate.changes) {
    const io = req.app.get("io");
    if (io) io.to(`group:${groupId}`).emit("group:receipts:updated", { groupId });
  }
  const ids = db.prepare("SELECT id FROM group_messages WHERE group_id = ? ORDER BY id ASC LIMIT 300").all(groupId);
  const messages = ids.map(row => groupMessageFor(groupId, row.id, req.auth.userId));
  res.json({ messages });
});

router.post("/:id/messages", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) {
    return res.status(404).json({ error: "Group not found." });
  }
  let body = String(req.body.body || "").trim();
  const mediaPath = String(req.body.mediaPath || "").trim();
  const mediaType = String(req.body.mediaType || "").trim();
  const replyToMessageId = req.body.replyToMessageId == null || req.body.replyToMessageId === "" ? null : Number(req.body.replyToMessageId);
  if (body.length > 2000 || (!body && !mediaPath)) {
    return res.status(400).json({ error: "Write a message or attach a file (maximum 2000 characters)." });
  }
  if (mediaPath && !/^[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm|ogg|m4a|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(mediaPath)) {
    return res.status(400).json({ error: "Invalid media file." });
  }
  if (mediaPath && !["image", "video", "document", "audio"].includes(mediaType)) {
    return res.status(400).json({ error: "Invalid media type." });
  }
  if (replyToMessageId !== null) {
    if (!Number.isSafeInteger(replyToMessageId) || !db.prepare("SELECT id FROM group_messages WHERE id = ? AND group_id = ? AND deleted_at IS NULL").get(replyToMessageId, groupId)) {
      return res.status(400).json({ error: "Reply target is not in this group." });
    }
  }
  if (!body) body = mediaType === "video" ? "[Video]" : mediaType === "audio" ? "[Voice message]" : mediaType === "document" ? "[Document]" : "[Image]";
  const isAnnouncement = req.body.isAnnouncement === true;
  if (isAnnouncement && !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can publish announcements." });
  }
  const result = db.prepare(`
    INSERT INTO group_messages (group_id, sender_id, body, media_path, media_type, reply_to_message_id, is_announcement)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, req.auth.userId, body, mediaPath || null, mediaPath ? mediaType : null, replyToMessageId, isAnnouncement ? 1 : 0);
  // Create one pending receipt for each other member who belongs at send time.
  db.prepare(`
    INSERT OR IGNORE INTO group_message_receipts (group_message_id, user_id)
    SELECT ?, user_id FROM group_members WHERE group_id = ? AND user_id != ?
  `).run(result.lastInsertRowid, groupId, req.auth.userId);
  const message = groupMessageFor(groupId, result.lastInsertRowid, req.auth.userId);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message", message);
  res.status(201).json({ message });
});

router.post("/:id/messages/:messageId/delivered", (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) {
    return res.status(404).json({ error: "Group not found." });
  }
  const message = db.prepare(
    "SELECT id, sender_id AS senderId FROM group_messages WHERE id = ? AND group_id = ?"
  ).get(messageId, groupId);
  if (!message || message.senderId === req.auth.userId) {
    return res.status(404).json({ error: "Message not found for this recipient." });
  }
  const updated = db.prepare(`
    UPDATE group_message_receipts
    SET delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
    WHERE group_message_id = ? AND user_id = ? AND delivered_at IS NULL
  `).run(messageId, req.auth.userId);
  if (updated.changes) {
    const io = req.app.get("io");
    if (io) io.to(`group:${groupId}`).emit("group:receipts:updated", { groupId, messageId });
  }
  res.json({ delivered: true });
});

router.post("/:id/messages/:messageId/reactions", (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = String(req.body.emoji || "");
  const allowed = ["👍","❤️","😂","😮","😢","🙏","🎉","🔥"];
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({error:"Group not found."});
  if (!Number.isSafeInteger(messageId) || !allowed.includes(emoji)) return res.status(400).json({error:"Choose a supported reaction."});
  const message = db.prepare("SELECT id FROM group_messages WHERE id = ? AND group_id = ? AND deleted_at IS NULL").get(messageId, groupId);
  if (!message) return res.status(404).json({error:"Message not found."});
  const existing = db.prepare("SELECT 1 FROM group_message_reactions WHERE group_message_id = ? AND user_id = ? AND emoji = ?").get(messageId, req.auth.userId, emoji);
  if (existing) db.prepare("DELETE FROM group_message_reactions WHERE group_message_id = ? AND user_id = ? AND emoji = ?").run(messageId, req.auth.userId, emoji);
  else db.prepare("INSERT INTO group_message_reactions (group_message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, req.auth.userId, emoji);
  const updated = groupMessageFor(groupId, messageId, req.auth.userId);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message:updated", updated);
  res.json({message: updated});
});

router.patch("/:id/messages/:messageId", (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  const body = String(req.body.body || "").trim();
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({error:"Group not found."});
  if (!body || body.length > 2000) return res.status(400).json({error:"Message must contain 1–2000 characters."});
  const msg = db.prepare("SELECT sender_id AS senderId, media_path AS mediaPath, deleted_at AS deletedAt FROM group_messages WHERE id = ? AND group_id = ?").get(messageId, groupId);
  if (!msg) return res.status(404).json({error:"Message not found."});
  if (msg.senderId !== req.auth.userId) return res.status(403).json({error:"Only the sender can edit this message."});
  if (msg.mediaPath || msg.deletedAt) return res.status(400).json({error:"Only active text messages can be edited."});
  db.prepare("UPDATE group_messages SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?").run(body, messageId);
  const updated = groupMessageFor(groupId, messageId, req.auth.userId);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message:updated", updated);
  res.json({message: updated});
});

router.delete("/:id/messages/:messageId", (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({error:"Group not found."});
  const msg = db.prepare("SELECT sender_id AS senderId FROM group_messages WHERE id = ? AND group_id = ?").get(messageId, groupId);
  if (!msg) return res.status(404).json({error:"Message not found."});
  if (msg.senderId !== req.auth.userId && !isAdmin(groupId, req.auth.userId)) return res.status(403).json({error:"Only the sender or a group admin can delete this message."});
  db.prepare("UPDATE group_messages SET body = 'This message was deleted', media_path = NULL, media_type = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(messageId);
  db.prepare("DELETE FROM group_message_reactions WHERE group_message_id = ?").run(messageId);
  const updated = groupMessageFor(groupId, messageId, req.auth.userId);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message:updated", updated);
  res.json({message: updated});
});


/* Phase 23: only group admins can pin or unpin messages. */
router.post("/:id/messages/:messageId/pin", (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can pin messages." });
  }
  const message = db.prepare("SELECT id, deleted_at AS deletedAt FROM group_messages WHERE id = ? AND group_id = ?").get(messageId, groupId);
  if (!message || message.deletedAt) return res.status(404).json({ error: "Active group message not found." });
  db.prepare("UPDATE group_messages SET pinned_at = CURRENT_TIMESTAMP, pinned_by = ? WHERE id = ?").run(req.auth.userId, messageId);
  const updated = groupMessageFor(groupId, messageId, req.auth.userId);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message:updated", updated);
  res.json({ message: updated });
});

router.delete("/:id/messages/:messageId/pin", (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can unpin messages." });
  }
  const result = db.prepare("UPDATE group_messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ? AND group_id = ? AND pinned_at IS NOT NULL").run(messageId, groupId);
  if (!result.changes) return res.status(404).json({ error: "Pinned message not found." });
  const updated = groupMessageFor(groupId, messageId, req.auth.userId);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message:updated", updated);
  res.json({ message: updated });
});

module.exports = router;
