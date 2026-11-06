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

  if (!receiverUsername) {
    return res.status(400).json({
      error: "Please select a recipient."
    });
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

  if (receiver.id === req.auth.userId) {
    return res.status(400).json({
      error: "You cannot message yourself."
    });
  }

  const result = db.prepare(`
    INSERT INTO messages
      (sender_id, receiver_id, body, media_path, media_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    req.auth.userId,
    receiver.id,
    body,
    mediaPath || null,
    mediaPath ? mediaType : null
  );

  const message = db.prepare(`
    SELECT m.id, s.username AS sender, r.username AS recipient,
           m.body, m.media_path AS mediaPath,
           m.media_type AS mediaType,
           m.created_at AS createdAt,
           m.delivered_at AS deliveredAt, m.read_at AS readAt
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
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
           m.body, m.media_path AS mediaPath,
           m.media_type AS mediaType,
           m.created_at AS createdAt,
           m.delivered_at AS deliveredAt, m.read_at AS readAt
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.id ASC
    LIMIT 200
  `).all(req.auth.userId, other.id, other.id, req.auth.userId);

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


module.exports = router;
