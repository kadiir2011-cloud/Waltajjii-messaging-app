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
    "SELECT id, username FROM users WHERE id != ? ORDER BY username LIMIT 100"
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

  if (mediaPath && !/^[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(mediaPath)) {
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
           m.created_at AS createdAt
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

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
           m.created_at AS createdAt
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


module.exports = router;
