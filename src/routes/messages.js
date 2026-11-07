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

router.get("/users", authenticate, (req, res) => {
  const users = db.prepare(
  `SELECT id, username,
          CASE WHEN profile_mode IN ('personal', 'both') THEN bio ELSE '' END AS bio,
          CASE WHEN profile_mode IN ('professional', 'both') THEN professional_title ELSE '' END AS professionalTitle,
          CASE WHEN profile_mode IN ('professional', 'both') THEN organization ELSE '' END AS organization,
          CASE WHEN profile_mode IN ('professional', 'both') THEN department ELSE '' END AS department,
          CASE WHEN profile_mode IN ('professional', 'both') THEN location ELSE '' END AS location,
          avatar_path AS avatarPath
   FROM users
   WHERE id != ?
   ORDER BY username
   LIMIT 100`
).all(req.auth.userId);
  res.json({ users });
});


router.post("/", authenticate, (req, res) => {
  const receiverUsername = String(req.body.receiverUsername || "").trim();
  let body = String(req.body.body || "").trim();
  const mediaPath = String(req.body.mediaPath || "").trim();
  const mediaType = String(req.body.mediaType || "").trim();
  const replyToMessageId = req.body.replyToMessageId == null || req.body.replyToMessageId === "" ? null : Number(req.body.replyToMessageId);

  if (!receiverUsername) {
    return res.status(400).json({
      error: "Please select a recipient."
    });
  }

  if (replyToMessageId !== null && (!Number.isSafeInteger(replyToMessageId) || replyToMessageId < 1)) {
    return res.status(400).json({ error: "Invalid reply target." });
  }

  if (body.length > 2000) {
    return res.status(400).json({
      error: "Message must not exceed 2000 characters."
    });
  }

  if (!body && !mediaPath) {
    return res.status(400).json({
      error: "Write a message or attach an image/video."
    });
  }

  if (mediaPath && !/^[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm|ogg|m4a|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(mediaPath)) {
  return res.status(400).json({
    error: "Invalid media file."
  });
}

if (mediaPath && !["image", "video", "document"].includes(mediaType)) {
  return res.status(400).json({
    error: "Invalid media type."
  });
}
  if (!body) {
  body = mediaType === "video"
    ? "[Video]"
    : mediaType === "document"
      ? "[Document]"
      : "[Image]";
}
  const receiver = db.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).get(receiverUsername);

  if (!receiver) {
    return res.status(404).json({
      error: "Recipient not found."
    });
  }

  if (replyToMessageId !== null) {
    const replyTarget = db.prepare(`
      SELECT id FROM messages
      WHERE id = ? AND (
        (sender_id = ? AND receiver_id = ?) OR
        (sender_id = ? AND receiver_id = ?)
      )
    `).get(replyToMessageId, req.auth.userId, receiver.id, receiver.id, req.auth.userId);
    if (!replyTarget) {
      return res.status(400).json({ error: "The message you are replying to is not in this conversation." });
    }
  }

  if (receiver.id === req.auth.userId) {
    return res.status(400).json({
      error: "You cannot message yourself."
    });
  }

  const result = db.prepare(`
    INSERT INTO messages
      (sender_id, receiver_id, body, media_path, media_type, reply_to_message_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.auth.userId,
    receiver.id,
    body,
    mediaPath || null,
    mediaPath ? mediaType : null,
    replyToMessageId
  );

  const message = db.prepare(`
    SELECT m.id, s.username AS sender, r.username AS recipient,
           m.body, m.media_path AS mediaPath,
           m.media_type AS mediaType,
           m.created_at AS createdAt,
           m.delivered_at AS deliveredAt, m.read_at AS readAt,
           m.forwarded_from_username AS forwardedFromUsername,
           m.reply_to_message_id AS replyToMessageId,
           replySender.username AS replyToSender,
           replyMessage.body AS replyToBody
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    LEFT JOIN messages replyMessage ON replyMessage.id = m.reply_to_message_id
    LEFT JOIN users replySender ON replySender.id = replyMessage.sender_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  // Notify the recipient's authenticated Socket.IO session(s) immediately.
  const io = req.app.get("io");
  if (io) {
    io.to(`user:${receiver.id}`).emit("message:new", message);
  }

  res.status(201).json({ message });
});


router.get("/conversation/:username", authenticate, (req, res) => {
  const other = db.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).get(String(req.params.username || ""));

  if (!other) {
    return res.status(404).json({ error: "User not found." });
  }

  const messages = db.prepare(`
    SELECT m.id, s.username AS sender, r.username AS recipient,
           CASE WHEN m.deleted_at IS NOT NULL THEN 'This message was deleted' ELSE m.body END AS body,
           CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.media_path END AS mediaPath,
           CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.media_type END AS mediaType,
           m.deleted_at AS deletedAt,
           m.created_at AS createdAt,
           m.delivered_at AS deliveredAt, m.read_at AS readAt,
           m.reply_to_message_id AS replyToMessageId,
           replySender.username AS replyToSender,
           replyMessage.body AS replyToBody
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    LEFT JOIN messages replyMessage ON replyMessage.id = m.reply_to_message_id
    LEFT JOIN users replySender ON replySender.id = replyMessage.sender_id
    WHERE ((m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?))
      AND NOT EXISTS (
        SELECT 1 FROM message_hidden_for h
        WHERE h.message_id = m.id AND h.user_id = ?
      )
    ORDER BY m.id ASC
    LIMIT 200
  `).all(req.auth.userId, other.id, other.id, req.auth.userId, req.auth.userId);

  const ids = messages.map(message => message.id);
  const reactions = ids.length ? db.prepare(`
    SELECT mr.message_id AS messageId, mr.emoji, COUNT(*) AS count,
           MAX(CASE WHEN mr.user_id = ? THEN 1 ELSE 0 END) AS reactedByMe,
           GROUP_CONCAT(u.username, ', ') AS usernames
    FROM message_reactions mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.message_id IN (${ids.map(() => "?").join(",")})
    GROUP BY mr.message_id, mr.emoji
    ORDER BY mr.emoji
  `).all(req.auth.userId, ...ids) : [];
  const byMessage = new Map();
  reactions.forEach(reaction => {
    if (!byMessage.has(reaction.messageId)) byMessage.set(reaction.messageId, []);
    byMessage.get(reaction.messageId).push({
      emoji: reaction.emoji,
      count: reaction.count,
      reactedByMe: Boolean(reaction.reactedByMe),
      usernames: reaction.usernames || ""
    });
  });
  messages.forEach(message => { message.reactions = byMessage.get(message.id) || []; });
  res.json({ messages });
});

// Mark incoming messages in this conversation as read when the recipient opens it.
router.post("/conversation/:username/read", authenticate, (req, res) => {
  const other = db.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).get(String(req.params.username || ""));

  if (!other) {
    return res.status(404).json({ error: "User not found." });
  }

  const unread = db.prepare(`
    SELECT id FROM messages
    WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL
  `).all(other.id, req.auth.userId);

  if (!unread.length) {
    return res.json({ updated: 0 });
  }

  db.prepare(`
    UPDATE messages
    SET delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
        read_at = CURRENT_TIMESTAMP
    WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL
  `).run(other.id, req.auth.userId);

  const receiptById = db.prepare(`
    SELECT m.id AS messageId, m.sender_id AS senderId,
           m.receiver_id AS receiverId, s.username AS sender,
           r.username AS recipient, m.delivered_at AS deliveredAt,
           m.read_at AS readAt
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    WHERE m.id = ? AND m.sender_id = ? AND m.receiver_id = ?
  `);
  const receipts = unread
    .map(row => receiptById.get(row.id, other.id, req.auth.userId))
    .filter(Boolean);

  const io = req.app.get("io");
  if (io) {
    receipts.forEach(receipt => {
      io.to(`user:${receipt.senderId}`).emit("message:status", {
        ...receipt,
        status: "read"
      });
    });
  }

  res.json({ updated: receipts.length });
});


// Delete a message for the current user, or for both participants when requested by its sender.
router.delete("/:messageId/delete", authenticate, (req, res) => {
  const messageId = Number(req.params.messageId);
  const scope = String(req.body.scope || "me");
  if (!Number.isSafeInteger(messageId) || messageId < 1 || !["me", "everyone"].includes(scope)) {
    return res.status(400).json({ error: "Choose a valid deletion option." });
  }
  const message = db.prepare(
    "SELECT id, sender_id AS senderId, receiver_id AS receiverId FROM messages " +
    "WHERE id = ? AND (sender_id = ? OR receiver_id = ?)"
  ).get(messageId, req.auth.userId, req.auth.userId);
  if (!message) return res.status(404).json({ error: "Message not found." });

  if (scope === "everyone") {
    if (message.senderId !== req.auth.userId) {
      return res.status(403).json({ error: "Only the sender can delete this message for everyone." });
    }
    db.prepare(
      "UPDATE messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, " +
      "body = 'This message was deleted', media_path = NULL, media_type = NULL " +
      "WHERE id = ? AND deleted_at IS NULL"
    ).run(req.auth.userId, messageId);
  } else {
    db.prepare(
      "INSERT OR IGNORE INTO message_hidden_for (message_id, user_id) VALUES (?, ?)"
    ).run(messageId, req.auth.userId);
  }

  const io = req.app.get("io");
  if (io) {
    io.to("user:" + message.senderId).emit("message:deleted", { messageId, scope });
    io.to("user:" + message.receiverId).emit("message:deleted", { messageId, scope });
  }
  res.json({ success: true, scope });
});

// Forward a visible direct message to another user's conversation.
router.post("/:messageId/forward", authenticate, (req, res) => {
  const messageId = Number(req.params.messageId);
  const receiverUsername = String(req.body.receiverUsername || "").trim();
  if (!Number.isSafeInteger(messageId) || messageId < 1 || !receiverUsername) {
    return res.status(400).json({ error: "Choose a valid message and recipient." });
  }

  const source = db.prepare(
    "SELECT m.id, m.sender_id AS senderId, m.receiver_id AS receiverId, " +
    "m.body, m.media_path AS mediaPath, m.media_type AS mediaType, " +
    "m.forwarded_from_username AS forwardedFromUsername, s.username AS originalSender " +
    "FROM messages m JOIN users s ON s.id = m.sender_id " +
    "WHERE m.id = ? AND (m.sender_id = ? OR m.receiver_id = ?)"
  ).get(messageId, req.auth.userId, req.auth.userId);
  if (!source) {
    return res.status(404).json({ error: "This message is no longer available to forward." });
  }

  const receiver = db.prepare("SELECT id FROM users WHERE username = ?").get(receiverUsername);
  if (!receiver) return res.status(404).json({ error: "Recipient not found." });
  if (receiver.id === req.auth.userId) {
    return res.status(400).json({ error: "You cannot forward a message to yourself." });
  }

  const result = db.prepare(
    "INSERT INTO messages (sender_id, receiver_id, body, media_path, media_type, forwarded_from_username) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    req.auth.userId, receiver.id, source.body, source.mediaPath, source.mediaType,
    source.forwardedFromUsername || source.originalSender
  );

  const message = db.prepare(
    "SELECT m.id, s.username AS sender, r.username AS recipient, m.body, " +
    "m.media_path AS mediaPath, m.media_type AS mediaType, m.created_at AS createdAt, " +
    "m.delivered_at AS deliveredAt, m.read_at AS readAt, " +
    "m.forwarded_from_username AS forwardedFromUsername " +
    "FROM messages m JOIN users s ON s.id = m.sender_id " +
    "JOIN users r ON r.id = m.receiver_id WHERE m.id = ?"
  ).get(result.lastInsertRowid);

  const io = req.app.get("io");
  if (io) io.to("user:" + receiver.id).emit("message:new", message);
  res.status(201).json({ message });
});

// Toggle an emoji reaction on a message in the authenticated user's conversation.
router.post("/:messageId/reactions", authenticate, (req, res) => {
  const messageId = Number(req.params.messageId);
  const emoji = String(req.body.emoji || "").trim();
  const allowedEmojis = new Set(["👍", "❤️", "😂", "😮", "😢", "🎉", "🙏", "🔥"]);
  if (!Number.isSafeInteger(messageId) || messageId < 1 || !allowedEmojis.has(emoji)) {
    return res.status(400).json({ error: "Choose a supported reaction." });
  }

  const message = db.prepare(`
    SELECT id, sender_id AS senderId, receiver_id AS receiverId,
           (SELECT username FROM users WHERE id = sender_id) AS sender,
           (SELECT username FROM users WHERE id = receiver_id) AS recipient
    FROM messages
    WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
  `).get(messageId, req.auth.userId, req.auth.userId);
  if (!message) return res.status(404).json({ error: "Message not found." });

  const existing = db.prepare(
    "SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?"
  ).get(messageId, req.auth.userId, emoji);
  if (existing) {
    db.prepare("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
      .run(messageId, req.auth.userId, emoji);
  } else {
    db.prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)")
      .run(messageId, req.auth.userId, emoji);
  }

  const reactions = db.prepare(`
    SELECT mr.emoji, COUNT(*) AS count,
           MAX(CASE WHEN mr.user_id = ? THEN 1 ELSE 0 END) AS reactedByMe,
           GROUP_CONCAT(u.username, ', ') AS usernames
    FROM message_reactions mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.message_id = ?
    GROUP BY mr.emoji
    ORDER BY mr.emoji
  `).all(req.auth.userId, messageId).map(row => ({
    emoji: row.emoji, count: row.count,
    reactedByMe: Boolean(row.reactedByMe),
    usernames: row.usernames || ""
  }));

  const payload = { messageId, sender: message.sender, recipient: message.recipient, reactions };
  const io = req.app.get("io");
  if (io) {
    io.to(`user:${message.senderId}`).emit("message:reaction:update", payload);
    io.to(`user:${message.receiverId}`).emit("message:reaction:update", payload);
  }
  res.json({ reactions });
});


module.exports = router;
