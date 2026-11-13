const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { verifyAccessToken } = require("../security/access-token");
const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Login required." });
  try {
    req.auth = verifyAccessToken(token, db);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired login token." });
  }
}
router.use(authenticate);

function member(channelId, userId) {
  return db.prepare("SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?").get(channelId, userId);
}
function admin(channelId, userId) {
  const m = member(channelId, userId);
  return m && ["owner", "admin"].includes(m.role);
}

// Public channels are discoverable; private channels are visible only to members.
router.get("/", (req, res) => {
  const channels = db.prepare(`
    SELECT c.id, c.name, c.description, c.visibility, c.created_at AS createdAt,
      u.username AS owner, (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id=c.id) AS memberCount,
      mine.role AS myRole
    FROM channels c JOIN users u ON u.id=c.created_by
    LEFT JOIN channel_members mine ON mine.channel_id=c.id AND mine.user_id=?
    WHERE c.visibility='public' OR mine.user_id IS NOT NULL
    ORDER BY c.id DESC LIMIT 100
  `).all(req.auth.userId);
  res.json({ channels });
});

router.post("/", (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const visibility = req.body.visibility === "private" ? "private" : "public";
  if (!name || name.length > 80) return res.status(400).json({ error: "Channel name must be 1–80 characters." });
  if (description.length > 300) return res.status(400).json({ error: "Description must be 300 characters or fewer." });
  const create = db.transaction(() => {
    const result = db.prepare("INSERT INTO channels (name, description, visibility, created_by) VALUES (?, ?, ?, ?)").run(name, description, visibility, req.auth.userId);
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')").run(result.lastInsertRowid, req.auth.userId);
    return result.lastInsertRowid;
  });
  const id = create();
  res.status(201).json({ channel: db.prepare("SELECT id, name, description, visibility, created_at AS createdAt FROM channels WHERE id=?").get(id) });
});

router.post("/:id/join", (req, res) => {
  const id = Number(req.params.id);
  const channel = db.prepare("SELECT id, visibility FROM channels WHERE id=?").get(id);
  if (!Number.isSafeInteger(id) || !channel || channel.visibility !== "public") return res.status(404).json({ error: "Public channel not found." });
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(id, req.auth.userId);
  res.json({ message: "You joined the channel." });
});

router.get("/:id/members", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || !member(id, req.auth.userId)) return res.status(404).json({ error: "Channel not found." });
  const members = db.prepare("SELECT u.id, u.username, cm.role, cm.joined_at AS joinedAt FROM channel_members cm JOIN users u ON u.id=cm.user_id WHERE cm.channel_id=? ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username").all(id);
  res.json({ members, canManage: Boolean(admin(id, req.auth.userId)) });
});

router.post("/:id/members", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || !admin(id, req.auth.userId)) return res.status(403).json({ error: "Only channel admins can invite members." });
  const username = String(req.body.username || "").trim();
  const user = db.prepare("SELECT id FROM users WHERE username=?").get(username);
  if (!user) return res.status(404).json({ error: "User not found." });
  try {
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(id, user.id);
  } catch (error) {
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "That user is already a channel member." });
    throw error;
  }
  res.status(201).json({ message: "Member invited." });
});

router.delete("/:id/members/:userId", (req, res) => {
  const id = Number(req.params.id), userId = Number(req.params.userId);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(userId) || !admin(id, req.auth.userId)) return res.status(403).json({ error: "Only channel admins can remove members." });
  const target = member(id, userId);
  if (!target) return res.status(404).json({ error: "Channel member not found." });
  if (target.role === "owner") return res.status(400).json({ error: "The channel owner cannot be removed." });
  db.prepare("DELETE FROM channel_members WHERE channel_id=? AND user_id=?").run(id, userId);
  res.json({ message: "Member removed." });
});

router.get("/:id/messages", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || !member(id, req.auth.userId)) return res.status(404).json({ error: "Channel not found." });
  const messages = db.prepare("SELECT cm.id, cm.channel_id AS channelId, cm.sender_id AS senderId, u.username AS sender, cm.body, cm.created_at AS createdAt FROM channel_messages cm JOIN users u ON u.id=cm.sender_id WHERE cm.channel_id=? ORDER BY cm.id DESC LIMIT 200").all(id).reverse();
  res.json({ messages, canPublish: Boolean(admin(id, req.auth.userId)) });
});

// Channels are broadcast spaces: only owners/admins can publish.
router.post("/:id/messages", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || !member(id, req.auth.userId)) return res.status(404).json({ error: "Channel not found." });
  if (!admin(id, req.auth.userId)) return res.status(403).json({ error: "Only channel admins can publish announcements." });
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 4000) return res.status(400).json({ error: "Announcement must contain 1–4000 characters." });
  const result = db.prepare("INSERT INTO channel_messages (channel_id, sender_id, body) VALUES (?, ?, ?)").run(id, req.auth.userId, body);
  const message = db.prepare("SELECT cm.id, cm.channel_id AS channelId, cm.sender_id AS senderId, u.username AS sender, cm.body, cm.created_at AS createdAt FROM channel_messages cm JOIN users u ON u.id=cm.sender_id WHERE cm.id=?").get(result.lastInsertRowid);
  res.status(201).json({ message });
});

router.delete("/:id/leave", (req, res) => {
  const id = Number(req.params.id);
  const m = member(id, req.auth.userId);
  if (!m) return res.status(404).json({ error: "Channel membership not found." });
  if (m.role === "owner") return res.status(400).json({ error: "The owner must transfer ownership before leaving." });
  db.prepare("DELETE FROM channel_members WHERE channel_id=? AND user_id=?").run(id, req.auth.userId);
  res.json({ message: "You left the channel." });
});

module.exports = router;
