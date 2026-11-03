const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Login required." });
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

async function membership(groupId, userId, client = db) {
  const result = await client.query(
    "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  return result.rows[0] || null;
}

async function isAdmin(groupId, userId, client = db) {
  const member = await membership(groupId, userId, client);
  return Boolean(member && member.role === "admin");
}

router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.id, g.name, g.created_by AS "createdBy",
              g.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS "memberCount",
              mine.role AS "myRole"
       FROM groups g
       JOIN group_members mine ON mine.group_id = g.id
       WHERE mine.user_id = $1
       ORDER BY g.id DESC`,
      [req.auth.userId]
    );
    res.json({ groups: result.rows });
  } catch (error) {
    console.error("Could not load groups:", error);
    res.status(500).json({ error: "Could not load groups." });
  }
});

router.post("/", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const usernames = Array.isArray(req.body.memberUsernames)
    ? [...new Set(req.body.memberUsernames.map(v => String(v).trim()).filter(Boolean))]
    : [];

  if (!name || name.length > 80) return res.status(400).json({ error: "Group name must be 1–80 characters." });
  if (usernames.length > 99) return res.status(400).json({ error: "A group can have at most 100 members including you." });

  const client = await db.connect();
  let transactionStarted = false;
  try {
    let users = [];
    if (usernames.length) {
      const placeholders = usernames.map((_, i) => "$" + (i + 1)).join(", ");
      const sql = "SELECT id, username FROM users WHERE LOWER(username) IN (" +
        "SELECT LOWER(input.username) FROM unnest(ARRAY[" + placeholders + "]::text[]) AS input(username))";
      const result = await client.query(sql, usernames);
      users = result.rows;
    }

    if (users.length !== usernames.length) {
      return res.status(400).json({ error: "One or more member usernames were not found." });
    }

    await client.query("BEGIN");
    transactionStarted = true;
    const groupResult = await client.query(
      'INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id, name, created_by AS "createdBy", created_at AS "createdAt"',
      [name, req.auth.userId]
    );
    const group = groupResult.rows[0];
    await client.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')",
      [group.id, req.auth.userId]
    );
    for (const user of users) {
      if (String(user.id) === String(req.auth.userId)) continue;
      await client.query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING",
        [group.id, user.id]
      );
    }
    await client.query("COMMIT");
    transactionStarted = false;
    res.status(201).json({ group });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("Could not create group:", error);
    res.status(500).json({ error: "Could not create group." });
  } finally {
    client.release();
  }
});

router.get("/:id/members", async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId)) return res.status(404).json({ error: "Group not found." });
  try {
    const member = await membership(groupId, req.auth.userId);
    if (!member) return res.status(404).json({ error: "Group not found." });
    const result = await db.query(
      `SELECT u.id, u.username, gm.role, gm.joined_at AS "joinedAt"
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END, u.username`,
      [groupId]
    );
    res.json({ members: result.rows, canManage: member.role === "admin" });
  } catch (error) {
    console.error("Could not load group members:", error);
    res.status(500).json({ error: "Could not load group members." });
  }
});

router.post("/:id/members", async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId)) return res.status(404).json({ error: "Group not found." });
  const username = String(req.body.username || "").trim();
  if (!username) return res.status(400).json({ error: "Enter a username." });
  try {
    if (!(await isAdmin(groupId, req.auth.userId))) return res.status(403).json({ error: "Only group admins can add members." });
    const userResult = await db.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1", [username]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "User not found." });
    const countResult = await db.query("SELECT COUNT(*)::int AS count FROM group_members WHERE group_id = $1", [groupId]);
    if (countResult.rows[0].count >= 100) return res.status(400).json({ error: "This group has reached 100 members." });
    const inserted = await db.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING RETURNING user_id",
      [groupId, user.id]
    );
    if (!inserted.rowCount) return res.status(409).json({ error: "That user is already a member." });
    res.status(201).json({ message: "Member added." });
  } catch (error) {
    console.error("Could not add group member:", error);
    res.status(500).json({ error: "Could not add group member." });
  }
});

router.delete("/:id/members/:userId", async (req, res) => {
  const groupId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(userId)) return res.status(400).json({ error: "Invalid group or user ID." });
  try {
    if (!(await isAdmin(groupId, req.auth.userId))) return res.status(403).json({ error: "Only group admins can remove members." });
    if (String(userId) === String(req.auth.userId)) {
      return res.status(400).json({ error: "An admin cannot remove themselves. Assign another admin first (admin transfer is not yet available)." });
    }
    const result = await db.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
    if (!result.rowCount) return res.status(404).json({ error: "Member not found." });
    res.json({ message: "Member removed." });
  } catch (error) {
    console.error("Could not remove group member:", error);
    res.status(500).json({ error: "Could not remove group member." });
  }
});

router.get("/:id/messages", async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId)) return res.status(404).json({ error: "Group not found." });
  try {
    if (!(await membership(groupId, req.auth.userId))) return res.status(404).json({ error: "Group not found." });
    const result = await db.query(
      `SELECT gm.id, gm.group_id AS "groupId", gm.sender_id AS "senderId",
              u.username AS sender, gm.body, gm.created_at AS "createdAt"
       FROM group_messages gm JOIN users u ON u.id = gm.sender_id
       WHERE gm.group_id = $1 ORDER BY gm.id ASC LIMIT 300`,
      [groupId]
    );
    res.json({ messages: result.rows });
  } catch (error) {
    console.error("Could not load group messages:", error);
    res.status(500).json({ error: "Could not load group messages." });
  }
});

router.post("/:id/messages", async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isSafeInteger(groupId)) return res.status(404).json({ error: "Group not found." });
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 2000) return res.status(400).json({ error: "Group messages must contain 1–2000 characters." });
  try {
    if (!(await membership(groupId, req.auth.userId))) return res.status(404).json({ error: "Group not found." });
    const inserted = await db.query(
      "INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id",
      [groupId, req.auth.userId, body]
    );
    const messageResult = await db.query(
      `SELECT gm.id, gm.group_id AS "groupId", gm.sender_id AS "senderId",
              u.username AS sender, gm.body, gm.created_at AS "createdAt"
       FROM group_messages gm JOIN users u ON u.id = gm.sender_id
       WHERE gm.id = $1`,
      [inserted.rows[0].id]
    );
    res.status(201).json({ message: messageResult.rows[0] });
  } catch (error) {
    console.error("Could not send group message:", error);
    res.status(500).json({ error: "Could not send group message." });
  }
});

module.exports = router;
