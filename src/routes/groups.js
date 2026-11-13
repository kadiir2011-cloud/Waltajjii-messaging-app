const express = require("express");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const db = require("../db");
const { verifyAccessToken } = require("../security/access-token");

const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Login required." });
  }
  try {
    req.auth = verifyAccessToken(token, db);
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

function logGroupActivity(groupId, actorId, eventType, subjectUserId = null, details = "") {
  db.prepare("INSERT INTO group_activity (group_id, actor_id, subject_user_id, event_type, details) VALUES (?, ?, ?, ?, ?)")
    .run(groupId, actorId || null, subjectUserId, eventType, String(details).slice(0, 240));
}

router.use(authenticate);

// Generate invitation QR images on the server so the browser does not depend on a third-party CDN.
router.post("/invitation/qr", async (req, res) => {
  const value = String(req.body.url || "").trim();
  if (!value || value.length > 2048) return res.status(400).json({ error: "A valid invitation URL is required." });
  let parsed;
  try {
    parsed = new URL(value);
    const configuredOrigin = process.env.PUBLIC_APP_URL
      ? new URL(process.env.PUBLIC_APP_URL).origin
      : `${req.protocol}://${req.get("host")}`;
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.origin !== configuredOrigin ||
        !parsed.pathname.includes("/")) {
      return res.status(400).json({ error: "Only this Waltajjii app's invitation links can be encoded." });
    }
  } catch {
    return res.status(400).json({ error: "The invitation URL is invalid." });
  }
  try {
    const dataUrl = await QRCode.toDataURL(value, {
      errorCorrectionLevel: "H",
      width: 240,
      margin: 2
    });
    res.json({ dataUrl });
  } catch (error) {
    console.error("Invitation QR generation failed:", error.message);
    res.status(500).json({ error: "The QR code could not be generated. You can still use the invitation link." });
  }
});

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
  logGroupActivity(groupId, req.auth.userId, "group_created");
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
  const canManage = Boolean(isAdmin(groupId, req.auth.userId));
  const settings = db.prepare("SELECT member_list_visibility AS memberListVisibility FROM groups WHERE id = ?").get(groupId);
  if (settings.memberListVisibility === "admins" && !canManage) {
    const self = db.prepare("SELECT u.id, u.username, gm.role, gm.joined_at AS joinedAt FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND gm.user_id = ?").all(groupId, req.auth.userId);
    return res.json({ members: self, canManage, memberListRestricted: true });
  }
  const members = db.prepare(`
    SELECT u.id, u.username, gm.role, gm.joined_at AS joinedAt
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? ORDER BY CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END, u.username
  `).all(groupId);
  res.json({ members, canManage, memberListRestricted: false });
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
  logGroupActivity(groupId, req.auth.userId, "member_added", user.id);
  const io = req.app.get("io");
  if (io) {
    io.in(`user:${user.id}`).socketsJoin(`group:${groupId}`);
    io.to(`user:${user.id}`).emit("groups:updated", { groupId });
    io.to(`group:${groupId}`).emit("group:members:updated", { groupId });
  }
  res.status(201).json({ message: "Member added." });
});

router.patch("/:id/members/:userId/role", (req, res) => {
  const groupId = Number(req.params.id);
  const userId = Number(req.params.userId);
  const role = String(req.body.role || "");
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(userId) || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can change member roles." });
  }
  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ error: "Role must be admin or member." });
  }
  const target = membership(groupId, userId);
  if (!target) return res.status(404).json({ error: "Member not found." });
  if (target.role === "admin" && role === "member") {
    const adminCount = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND role = 'admin'").get(groupId).n;
    if (adminCount <= 1) return res.status(400).json({ error: "A group must always have at least one admin." });
  }
  db.prepare("UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?").run(role, groupId, userId);
  logGroupActivity(groupId, req.auth.userId, "role_changed", userId, role);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:members:updated", { groupId, roleChanged: true });
  res.json({ message: role === "admin" ? "Member promoted to admin." : "Admin role removed." });
});

router.delete("/:id/leave", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId)) return res.status(400).json({ error: "Invalid group." });
  const current = membership(groupId, req.auth.userId);
  if (!current) return res.status(404).json({ error: "Group membership not found." });
  if (current.role === "admin") {
    const otherAdmins = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND role = 'admin' AND user_id != ?").get(groupId, req.auth.userId).n;
    if (otherAdmins === 0) return res.status(400).json({ error: "Assign another admin before leaving this group." });
  }
  db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, req.auth.userId);
  logGroupActivity(groupId, req.auth.userId, "member_left", req.auth.userId);
  const io = req.app.get("io");
  if (io) {
    io.to(`group:${groupId}`).emit("group:members:updated", { groupId, left: req.auth.userId });
    io.in(`user:${req.auth.userId}`).socketsLeave(`group:${groupId}`);
    io.to(`user:${req.auth.userId}`).emit("groups:updated", { groupId, removed: true });
  }
  res.json({ message: "You left the group." });
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
  logGroupActivity(groupId, req.auth.userId, "member_removed", userId);
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


/* Phase 25A: secure, expiring and revocable group invitation links. */
const crypto = require("crypto");

function invitationHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validInvitationToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,100}$/.test(token);
}

function invitationUrl(req, token) {
  const configuredBase = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  const base = configuredBase || `${req.protocol}://${req.get("host")}`;
  return `${base}/?groupInvite=${encodeURIComponent(token)}`;
}

// Create an invitation. The raw token is returned once and is never stored.
router.post("/:id/invitations", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can create invitation links." });
  }
  const duration = Number(req.body.expiresInHours || 24);
  const allowedDurations = [1, 24, 168, 720];
  if (!allowedDurations.includes(duration)) {
    return res.status(400).json({ error: "Choose an expiry of 1 hour, 1 day, 7 days, or 30 days." });
  }
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = invitationHash(rawToken);
  const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
  const useLimit = req.body.useLimit == null || req.body.useLimit === "" ? null : Number(req.body.useLimit);
  if (useLimit !== null && (!Number.isSafeInteger(useLimit) || useLimit < 1 || useLimit > 1000)) {
    return res.status(400).json({ error: "Use limit must be between 1 and 1000." });
  }
  const result = db.prepare(`
    INSERT INTO group_invitations (group_id, token_hash, created_by, expires_at, use_limit)
    VALUES (?, ?, ?, ?, ?)
  `).run(groupId, tokenHash, req.auth.userId, expiresAt, useLimit);
  logGroupActivity(groupId, req.auth.userId, "invitation_created");
  res.status(201).json({
    invitation: {
      id: result.lastInsertRowid,
      url: invitationUrl(req, rawToken),
      expiresAt,
      useLimit
    }
  });
});

// List active and historical invitations for admins; never return token hashes.
router.get("/:id/invitations", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can view invitation links." });
  }
  const invitations = db.prepare(`
    SELECT i.id, i.created_at AS createdAt, i.expires_at AS expiresAt,
      i.revoked_at AS revokedAt, i.use_limit AS useLimit, i.use_count AS useCount,
      u.username AS createdBy
    FROM group_invitations i JOIN users u ON u.id = i.created_by
    WHERE i.group_id = ? ORDER BY i.id DESC LIMIT 100
  `).all(groupId);
  res.json({ invitations });
});

// Revoke an invitation immediately.
router.delete("/:id/invitations/:invitationId", (req, res) => {
  const groupId = Number(req.params.id);
  const invitationId = Number(req.params.invitationId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(invitationId) ||
      !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group admins can revoke invitation links." });
  }
  const result = db.prepare(`
    UPDATE group_invitations SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND group_id = ? AND revoked_at IS NULL
  `).run(invitationId, groupId);
  if (!result.changes) return res.status(404).json({ error: "Active invitation not found." });
  logGroupActivity(groupId, req.auth.userId, "invitation_revoked");
  res.json({ message: "Invitation revoked." });
});

// Safe preview: reveal only group name and basic invitation validity, never group content.
router.get("/invitation/:token", (req, res) => {
  const token = req.params.token;
  if (!validInvitationToken(token)) return res.status(404).json({ error: "Invitation not found." });
  const invitation = db.prepare(`
    SELECT i.id, i.group_id AS groupId, i.expires_at AS expiresAt,
      i.revoked_at AS revokedAt, i.use_limit AS useLimit, i.use_count AS useCount,
      g.name AS groupName
    FROM group_invitations i JOIN groups g ON g.id = i.group_id
    WHERE i.token_hash = ?
  `).get(invitationHash(token));
  if (!invitation || invitation.revokedAt || Date.parse(invitation.expiresAt) <= Date.now() ||
      (invitation.useLimit !== null && invitation.useCount >= invitation.useLimit)) {
    return res.status(410).json({ error: "This invitation is expired, revoked, or has reached its use limit." });
  }
  res.json({ invitation: { groupName: invitation.groupName, expiresAt: invitation.expiresAt } });
});

// Join through a valid invite. Membership and use count are committed atomically.
router.post("/invitation/:token/join", (req, res) => {
  const token = req.params.token;
  if (!validInvitationToken(token)) return res.status(404).json({ error: "Invitation not found." });
  const join = db.transaction(() => {
    const invite = db.prepare("SELECT i.id, i.group_id AS groupId, i.expires_at AS expiresAt, i.revoked_at AS revokedAt, i.use_limit AS useLimit, i.use_count AS useCount, g.approval_required AS approvalRequired FROM group_invitations i JOIN groups g ON g.id = i.group_id WHERE i.token_hash = ?").get(invitationHash(token));
    if (!invite || invite.revokedAt || Date.parse(invite.expiresAt) <= Date.now() ||
        (invite.useLimit !== null && invite.useCount >= invite.useLimit)) {
      return { error: "This invitation is expired, revoked, or has reached its use limit." };
    }
    if (membership(invite.groupId, req.auth.userId)) return { alreadyMember: true, groupId: invite.groupId };
    const count = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?").get(invite.groupId).n;
    if (count >= 100) return { error: "This group has reached 100 members." };
    if (invite.approvalRequired) {
      const pending = db.prepare("SELECT id FROM group_join_requests WHERE group_id = ? AND user_id = ? AND status = 'pending'").get(invite.groupId, req.auth.userId);
      if (pending) {
        db.prepare("UPDATE group_join_requests SET invitation_id = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?").run(invite.id, pending.id);
        return { pending: true, requestId: pending.id, groupId: invite.groupId };
      }
      const created = db.prepare("INSERT INTO group_join_requests (group_id, user_id, invitation_id) VALUES (?, ?, ?)").run(invite.groupId, req.auth.userId, invite.id);
      db.prepare("INSERT INTO group_invitation_events (invitation_id, user_id, event_type) VALUES (?, ?, 'requested')").run(invite.id, req.auth.userId);
      logGroupActivity(invite.groupId, req.auth.userId, "join_requested", req.auth.userId);
      return { pending: true, requestId: created.lastInsertRowid, groupId: invite.groupId };
    }
    const changed = db.prepare("UPDATE group_invitations SET use_count = use_count + 1 WHERE id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now') AND (use_limit IS NULL OR use_count < use_limit)").run(invite.id);
    if (!changed.changes) return { error: "This invitation is no longer available." };
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(invite.groupId, req.auth.userId);
    db.prepare("INSERT INTO group_invitation_events (invitation_id, user_id, event_type) VALUES (?, ?, 'joined')").run(invite.id, req.auth.userId);
    logGroupActivity(invite.groupId, req.auth.userId, "member_joined", req.auth.userId);
    return { groupId: invite.groupId };
  });
  try {
    const result = join();
    if (result.error) return res.status(410).json({ error: result.error });
    const io = req.app.get("io");
    if (result.pending) {
      if (io) io.to("group:" + result.groupId).emit("group:join-request", { groupId: result.groupId, requestId: result.requestId });
      return res.status(202).json({ message: "Your request has been sent to the group admins for approval.", pending: true, groupId: result.groupId });
    }
    if (!result.alreadyMember && io) {
      io.in("user:" + req.auth.userId).socketsJoin("group:" + result.groupId);
      io.to("user:" + req.auth.userId).emit("groups:updated", { groupId: result.groupId });
      io.to("group:" + result.groupId).emit("group:members:updated", { groupId: result.groupId });
    }
    res.json({ message: result.alreadyMember ? "You are already a member of this group." : "You joined the group.", groupId: result.groupId, alreadyMember: Boolean(result.alreadyMember) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "You are already a member or have a pending request." });
    }
    throw error;
  }
});


/* Phase 25B: admins review invitation-based membership requests. */
router.get("/:id/join-requests", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !isAdmin(groupId, req.auth.userId)) return res.status(403).json({ error: "Only group admins can review join requests." });
  const requests = db.prepare("SELECT r.id, r.user_id AS userId, u.username, r.created_at AS createdAt, r.status FROM group_join_requests r JOIN users u ON u.id = r.user_id WHERE r.group_id = ? AND r.status = 'pending' ORDER BY r.created_at ASC LIMIT 100").all(groupId);
  res.json({ requests });
});

router.post("/:id/join-requests/:requestId/review", (req, res) => {
  const groupId = Number(req.params.id), requestId = Number(req.params.requestId);
  const decision = String(req.body.decision || "");
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(requestId) || !isAdmin(groupId, req.auth.userId)) return res.status(403).json({ error: "Only group admins can review join requests." });
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Choose approve or reject." });
  const review = db.transaction(() => {
    const request = db.prepare("SELECT r.id, r.user_id AS userId, r.invitation_id AS invitationId, r.status, i.expires_at AS expiresAt, i.revoked_at AS revokedAt, i.use_limit AS useLimit, i.use_count AS useCount FROM group_join_requests r LEFT JOIN group_invitations i ON i.id = r.invitation_id WHERE r.id = ? AND r.group_id = ?").get(requestId, groupId);
    if (!request || request.status !== "pending") return { error: "This request has already been reviewed or no longer exists." };
    if (decision === "approve") {
      if (membership(groupId, request.userId)) {
        db.prepare("UPDATE group_join_requests SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=? WHERE id=?").run(req.auth.userId, requestId);
        return { alreadyMember: true, userId: request.userId };
      }
      if (!request.invitationId || request.revokedAt || !request.expiresAt || Date.parse(request.expiresAt) <= Date.now() ||
          (request.useLimit !== null && request.useCount >= request.useLimit)) return { error: "The invitation has expired, been revoked, or reached its use limit. The request cannot be approved." };
      const count = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?").get(groupId).n;
      if (count >= 100) return { error: "This group has reached 100 members." };
      const consumed = db.prepare("UPDATE group_invitations SET use_count = use_count + 1 WHERE id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now') AND (use_limit IS NULL OR use_count < use_limit)").run(request.invitationId);
      if (!consumed.changes) return { error: "The invitation is no longer available." };
      db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')").run(groupId, request.userId);
      db.prepare("UPDATE group_join_requests SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=? WHERE id=?").run(req.auth.userId, requestId);
      db.prepare("INSERT INTO group_invitation_events (invitation_id, user_id, event_type) VALUES (?, ?, 'joined')").run(request.invitationId, request.userId);
      logGroupActivity(groupId, req.auth.userId, "join_approved", request.userId);
      return { userId: request.userId, approved: true };
    }
    db.prepare("UPDATE group_join_requests SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=? WHERE id=?").run(req.auth.userId, requestId);
    logGroupActivity(groupId, req.auth.userId, "join_rejected", request.userId);
    return { userId: request.userId, rejected: true };
  });
  try {
    const result = review();
    if (result.error) return res.status(409).json({ error: result.error });
    const io = req.app.get("io");
    if (result.approved && io) {
      io.in("user:" + result.userId).socketsJoin("group:" + groupId);
      io.to("user:" + result.userId).emit("groups:updated", { groupId });
      io.to("group:" + groupId).emit("group:members:updated", { groupId });
    }
    if (io) io.to("user:" + result.userId).emit("group:join-request:decision", { groupId, decision, alreadyMember: Boolean(result.alreadyMember) });
    res.json({ message: result.alreadyMember ? "The requester is already a member." : decision === "approve" ? "Join request approved." : "Join request rejected." });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "This user is already a member." });
    throw error;
  }
});

/* Phase 25C: group description, rules and privacy controls. */
router.get("/:id/details", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({ error: "Group not found." });
  const details = db.prepare("SELECT id, name, description, rules, visibility, approval_required AS approvalRequired, member_list_visibility AS memberListVisibility FROM groups WHERE id = ?").get(groupId);
  res.json({ details });
});

router.patch("/:id/details", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !isAdmin(groupId, req.auth.userId)) return res.status(403).json({ error: "Only group admins can update group details." });
  const description = String(req.body.description ?? "").trim();
  const rules = String(req.body.rules ?? "").trim();
  const currentSettings = db.prepare("SELECT visibility FROM groups WHERE id = ?").get(groupId);
  const visibility = String(req.body.visibility ?? currentSettings.visibility ?? "private");
  const approvalRequired = req.body.approvalRequired === true;
  const memberListVisibility = String(req.body.memberListVisibility || "members");
  if (description.length > 500) return res.status(400).json({ error: "Group description must be 500 characters or fewer." });
  if (rules.length > 2000) return res.status(400).json({ error: "Group rules must be 2,000 characters or fewer." });
  if (!["private", "public"].includes(visibility)) return res.status(400).json({ error: "Visibility must be private or public." });
  if (!["members", "admins"].includes(memberListVisibility)) return res.status(400).json({ error: "Member-list visibility must be members or admins." });
  db.prepare("UPDATE groups SET description=?, rules=?, visibility=?, approval_required=?, member_list_visibility=? WHERE id=?").run(description, rules, visibility, approvalRequired ? 1 : 0, memberListVisibility, groupId);
  logGroupActivity(groupId, req.auth.userId, "group_settings_updated", req.auth.userId, visibility + (approvalRequired ? ";approval required" : ";approval off") + ";member list:" + memberListVisibility);
  const details = db.prepare("SELECT id, name, description, rules, visibility, approval_required AS approvalRequired, member_list_visibility AS memberListVisibility FROM groups WHERE id=?").get(groupId);
  const io = req.app.get("io");
  if (io) io.to("group:" + groupId).emit("group:details:updated", { groupId });
  res.json({ details, message: "Group details saved." });
});

/* Phase 25D: member-visible, paginated governance and membership history. */
router.get("/:id/activity", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({ error: "Group not found." });
  const rawLimit = Number(req.query.limit || 30), rawBefore = Number(req.query.before || 0);
  const limit = Number.isSafeInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 30;
  const before = Number.isSafeInteger(rawBefore) && rawBefore > 0 ? rawBefore : Number.MAX_SAFE_INTEGER;
  const events = db.prepare("SELECT a.id, a.event_type AS eventType, a.details, a.created_at AS createdAt, actor.username AS actorUsername, subject.username AS subjectUsername FROM group_activity a LEFT JOIN users actor ON actor.id = a.actor_id LEFT JOIN users subject ON subject.id = a.subject_user_id WHERE a.group_id = ? AND a.id < ? ORDER BY a.id DESC LIMIT ?").all(groupId, before, limit);
  res.json({ events, nextBefore: events.length === limit ? events[events.length - 1].id : null });
});


/* Phase 26: group polls. All poll data is restricted to current group members. */
function pollPayload(groupId, userId) {
  const polls = db.prepare(`
    SELECT p.id, p.group_id AS groupId, p.creator_id AS creatorId,
      u.username AS creatorUsername, p.question,
      p.multiple_choice AS multipleChoice, p.status,
      p.created_at AS createdAt, p.closed_at AS closedAt,
      (SELECT COUNT(DISTINCT v.user_id) FROM group_poll_votes v WHERE v.poll_id = p.id) AS voterCount
    FROM group_polls p JOIN users u ON u.id = p.creator_id
    WHERE p.group_id = ? ORDER BY p.id DESC LIMIT 50
  `).all(groupId);
  const optionsQuery = db.prepare(`
    SELECT o.id, o.option_text AS text,
      (SELECT COUNT(*) FROM group_poll_votes v WHERE v.option_id = o.id) AS votes,
      EXISTS(SELECT 1 FROM group_poll_votes v WHERE v.option_id = o.id AND v.user_id = ?) AS selected
    FROM group_poll_options o WHERE o.poll_id = ? ORDER BY o.id
  `);
  return polls.map(p => ({ ...p, multipleChoice: Boolean(p.multipleChoice),
    options: optionsQuery.all(userId, p.id).map(o => ({ ...o, selected: Boolean(o.selected) }))
  }));
}

router.get("/:id/polls", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !membership(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group members can view polls." });
  }
  res.json({ polls: pollPayload(groupId, req.auth.userId) });
});

router.post("/:id/polls", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !membership(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only group members can create polls." });
  }
  const question = String(req.body.question || "").trim();
  const rawOptions = Array.isArray(req.body.options) ? req.body.options : [];
  const options = rawOptions.map(value => String(value || "").trim());
  const multipleChoice = Boolean(req.body.multipleChoice);
  if (question.length < 1 || question.length > 300) return res.status(400).json({ error: "Poll question must be 1–300 characters." });
  if (options.length < 2 || options.length > 10 || options.some(value => value.length < 1 || value.length > 100)) {
    return res.status(400).json({ error: "Add 2–10 options, each 1–100 characters." });
  }
  const normalized = options.map(value => value.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) return res.status(400).json({ error: "Poll options must be unique." });
  const create = db.transaction(() => {
    const result = db.prepare("INSERT INTO group_polls (group_id, creator_id, question, multiple_choice) VALUES (?, ?, ?, ?)")
      .run(groupId, req.auth.userId, question, multipleChoice ? 1 : 0);
    const insertOption = db.prepare("INSERT INTO group_poll_options (poll_id, option_text) VALUES (?, ?)");
    options.forEach(option => insertOption.run(result.lastInsertRowid, option));
    logGroupActivity(groupId, req.auth.userId, "poll_created", null, question.slice(0, 100));
    return result.lastInsertRowid;
  });
  const pollId = create();
  const io = req.app.get("io");
  if (io) io.to("group:" + groupId).emit("group:polls:updated", { groupId, pollId });
  res.status(201).json({ poll: pollPayload(groupId, req.auth.userId).find(p => p.id === pollId) });
});

router.put("/:id/polls/:pollId/vote", (req, res) => {
  const groupId = Number(req.params.id), pollId = Number(req.params.pollId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(pollId) ||
      !membership(groupId, req.auth.userId)) return res.status(403).json({ error: "Only group members can vote." });
  const optionIds = Array.isArray(req.body.optionIds) ? [...new Set(req.body.optionIds.map(Number))] : [];
  if (!optionIds.length || optionIds.length > 10 || optionIds.some(id => !Number.isSafeInteger(id) || id < 1)) {
    return res.status(400).json({ error: "Select at least one valid poll option." });
  }
  const vote = db.transaction(() => {
    const poll = db.prepare("SELECT id, multiple_choice AS multipleChoice, status FROM group_polls WHERE id = ? AND group_id = ?").get(pollId, groupId);
    if (!poll) return { error: "Poll not found." };
    if (poll.status !== "open") return { error: "This poll is closed." };
    if (!poll.multipleChoice && optionIds.length !== 1) return { error: "Choose only one option for this poll." };
    const placeholders = optionIds.map(() => "?").join(",");
    const valid = db.prepare("SELECT id FROM group_poll_options WHERE poll_id = ? AND id IN (" + placeholders + ")").all(pollId, ...optionIds);
    if (valid.length !== optionIds.length) return { error: "One or more selected options do not belong to this poll." };
    // Replace the member's previous selection so both single- and multiple-choice votes can be edited.
    db.prepare("DELETE FROM group_poll_votes WHERE poll_id = ? AND user_id = ?").run(pollId, req.auth.userId);
    const insert = db.prepare("INSERT OR IGNORE INTO group_poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)");
    optionIds.forEach(optionId => insert.run(pollId, optionId, req.auth.userId));
    return { ok: true };
  });
  const result = vote();
  if (result.error) return res.status(result.error === "Poll not found." ? 404 : 400).json({ error: result.error });
  const io = req.app.get("io");
  if (io) io.to("group:" + groupId).emit("group:polls:updated", { groupId, pollId });
  res.json({ poll: pollPayload(groupId, req.auth.userId).find(p => p.id === pollId) });
});

router.post("/:id/polls/:pollId/close", (req, res) => {
  const groupId = Number(req.params.id), pollId = Number(req.params.pollId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(pollId) ||
      !membership(groupId, req.auth.userId)) return res.status(403).json({ error: "Only group members can close polls." });
  const poll = db.prepare("SELECT creator_id AS creatorId, status FROM group_polls WHERE id = ? AND group_id = ?").get(pollId, groupId);
  if (!poll) return res.status(404).json({ error: "Poll not found." });
  if (poll.creatorId !== req.auth.userId && !isAdmin(groupId, req.auth.userId)) {
    return res.status(403).json({ error: "Only the poll creator or a group admin can close this poll." });
  }
  if (poll.status === "closed") return res.json({ poll: pollPayload(groupId, req.auth.userId).find(p => p.id === pollId) });
  db.prepare("UPDATE group_polls SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE id = ? AND group_id = ? AND status = 'open'")
    .run(req.auth.userId, pollId, groupId);
  logGroupActivity(groupId, req.auth.userId, "poll_closed");
  const io = req.app.get("io");
  if (io) io.to("group:" + groupId).emit("group:polls:updated", { groupId, pollId });
  res.json({ poll: pollPayload(groupId, req.auth.userId).find(p => p.id === pollId) });
});

module.exports = router;


/* Phase 27: group events, scheduling and member RSVPs. */
router.get("/:id/events", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({ error: "Group not found." });
  const events = db.prepare(`
    SELECT e.id, e.group_id AS groupId, e.created_by AS createdBy, creator.username AS creatorUsername,
      e.title, e.description, e.starts_at AS startsAt, e.location, e.reminder_minutes AS reminderMinutes,
      e.status, e.created_at AS createdAt, e.cancelled_at AS cancelledAt,
      (SELECT response FROM group_event_rsvps WHERE event_id = e.id AND user_id = ?) AS myResponse,
      (SELECT COUNT(*) FROM group_event_rsvps WHERE event_id = e.id AND response = 'going') AS goingCount,
      (SELECT COUNT(*) FROM group_event_rsvps WHERE event_id = e.id AND response = 'maybe') AS maybeCount,
      (SELECT COUNT(*) FROM group_event_rsvps WHERE event_id = e.id AND response = 'not_going') AS notGoingCount
    FROM group_events e JOIN users creator ON creator.id = e.created_by
    WHERE e.group_id = ? ORDER BY CASE e.status WHEN 'scheduled' THEN 0 ELSE 1 END, e.starts_at ASC, e.id DESC
  `).all(req.auth.userId, groupId);
  const attendees = db.prepare(`
    SELECT r.event_id AS eventId, r.response, u.username
    FROM group_event_rsvps r JOIN users u ON u.id = r.user_id
    JOIN group_events e ON e.id = r.event_id
    WHERE e.group_id = ? ORDER BY u.username COLLATE NOCASE
  `).all(groupId);
  const byEvent = new Map();
  for (const item of attendees) {
    if (!byEvent.has(item.eventId)) byEvent.set(item.eventId, { going: [], maybe: [], notGoing: [] });
    const key = item.response === 'not_going' ? 'notGoing' : item.response;
    byEvent.get(item.eventId)[key].push(item.username);
  }
  res.json({ events: events.map(event => ({ ...event, attendees: byEvent.get(event.id) || { going: [], maybe: [], notGoing: [] } })) });
});

router.post("/:id/events", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) return res.status(404).json({ error: "Group not found." });
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const location = String(req.body.location || "").trim();
  const startsAt = String(req.body.startsAt || "").trim();
  const reminderMinutes = Number(req.body.reminderMinutes || 0);
  const startDate = new Date(startsAt);
  if (!title || title.length > 120) return res.status(400).json({ error: "Event title must be 1–120 characters." });
  if (description.length > 2000) return res.status(400).json({ error: "Event description must be at most 2,000 characters." });
  if (location.length > 200) return res.status(400).json({ error: "Location must be at most 200 characters." });
  if (!startsAt || Number.isNaN(startDate.getTime()) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(startsAt)) return res.status(400).json({ error: "Choose a valid event date and time." });
  if (startDate.getTime() < Date.now() - 60000 || startDate.getTime() > Date.now() + 366 * 86400000) return res.status(400).json({ error: "Events must be scheduled from now up to one year ahead." });
  if (![0, 5, 10, 15, 30, 60, 1440].includes(reminderMinutes)) return res.status(400).json({ error: "Choose a supported reminder interval." });
  const result = db.prepare("INSERT INTO group_events (group_id, created_by, title, description, starts_at, location, reminder_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(groupId, req.auth.userId, title, description, startDate.toISOString(), location, reminderMinutes);
  logGroupActivity(groupId, req.auth.userId, "event_created", null, title);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:events:updated", { groupId, eventId: Number(result.lastInsertRowid) });
  res.status(201).json({ message: "Group event created.", eventId: Number(result.lastInsertRowid) });
});

router.put("/:id/events/:eventId/rsvp", (req, res) => {
  const groupId = Number(req.params.id), eventId = Number(req.params.eventId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(eventId) || !membership(groupId, req.auth.userId)) return res.status(404).json({ error: "Event not found." });
  const response = String(req.body.response || "");
  if (!["going", "maybe", "not_going"].includes(response)) return res.status(400).json({ error: "Choose Going, Maybe or Not going." });
  const event = db.prepare("SELECT id, status FROM group_events WHERE id = ? AND group_id = ?").get(eventId, groupId);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (event.status !== "scheduled") return res.status(409).json({ error: "This event is cancelled; RSVPs are closed." });
  db.prepare(`INSERT INTO group_event_rsvps (event_id, user_id, response) VALUES (?, ?, ?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET response = excluded.response, updated_at = CURRENT_TIMESTAMP`).run(eventId, req.auth.userId, response);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:events:updated", { groupId, eventId });
  res.json({ message: "Your RSVP has been saved.", response });
});

router.post("/:id/events/:eventId/cancel", (req, res) => {
  const groupId = Number(req.params.id), eventId = Number(req.params.eventId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(eventId) || !membership(groupId, req.auth.userId)) return res.status(404).json({ error: "Event not found." });
  const event = db.prepare("SELECT id, created_by AS createdBy, status, title FROM group_events WHERE id = ? AND group_id = ?").get(eventId, groupId);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (event.createdBy !== req.auth.userId && !isAdmin(groupId, req.auth.userId)) return res.status(403).json({ error: "Only the event creator or a group admin can cancel this event." });
  if (event.status === "cancelled") return res.json({ message: "This event is already cancelled." });
  db.prepare("UPDATE group_events SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ? WHERE id = ?").run(req.auth.userId, eventId);
  logGroupActivity(groupId, req.auth.userId, "event_cancelled", null, event.title);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:events:updated", { groupId, eventId });
  res.json({ message: "Event cancelled. Its details and RSVP list remain visible." });
});
