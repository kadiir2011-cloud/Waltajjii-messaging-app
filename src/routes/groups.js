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
      (SELECT gm.role FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = ?) AS myRole
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

router.get("/:id/messages", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) {
    return res.status(404).json({ error: "Group not found." });
  }
  const messages = db.prepare(`
    SELECT gm.id, gm.group_id AS groupId, gm.sender_id AS senderId,
      u.username AS sender, gm.body, gm.created_at AS createdAt
    FROM group_messages gm JOIN users u ON u.id = gm.sender_id
    WHERE gm.group_id = ? ORDER BY gm.id ASC LIMIT 300
  `).all(groupId);
  res.json({ messages });
});

router.post("/:id/messages", (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId) || !membership(groupId, req.auth.userId)) {
    return res.status(404).json({ error: "Group not found." });
  }
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 2000) {
    return res.status(400).json({ error: "Group messages must contain 1–2000 characters." });
  }
  const result = db.prepare("INSERT INTO group_messages (group_id, sender_id, body) VALUES (?, ?, ?)").run(groupId, req.auth.userId, body);
  const message = db.prepare(`
    SELECT gm.id, gm.group_id AS groupId, gm.sender_id AS senderId,
      u.username AS sender, gm.body, gm.created_at AS createdAt
    FROM group_messages gm JOIN users u ON u.id = gm.sender_id WHERE gm.id = ?
  `).get(result.lastInsertRowid);
  const io = req.app.get("io");
  if (io) io.to(`group:${groupId}`).emit("group:message", message);
  res.status(201).json({ message });
});

module.exports = router;
