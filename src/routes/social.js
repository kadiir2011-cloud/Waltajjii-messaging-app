
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");
const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Login required." });
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, { issuer: "waltajjii", audience: "waltajjii-users" });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired login token." });
  }
}
router.use(authenticate);

function notify(userId, actorId, type, entityId, message) {
  if (Number(userId) === Number(actorId)) return;
  db.prepare("INSERT INTO notifications (user_id, actor_id, type, entity_id, message) VALUES (?, ?, ?, ?, ?)")
    .run(userId, actorId, type, entityId || null, message);
}
function profileSelect() {
  return "SELECT u.id, u.username, u.full_name AS fullName, CASE WHEN u.profile_mode IN ('personal','both') THEN u.bio ELSE '' END AS bio, CASE WHEN u.profile_mode IN ('professional','both') THEN u.professional_title ELSE '' END AS professionalTitle, CASE WHEN u.profile_mode IN ('professional','both') THEN u.organization ELSE '' END AS organization, CASE WHEN u.profile_mode IN ('professional','both') THEN u.department ELSE '' END AS department, CASE WHEN u.profile_mode IN ('professional','both') THEN u.location ELSE '' END AS location, u.avatar_path AS avatarPath, u.profile_background AS profileBackground FROM users u";
}

router.get("/discover", (req, res) => {
  const search = String(req.query.q || "").trim().slice(0, 80);
  const pattern = "%" + search + "%";
  const sql = "SELECT p.*, EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = p.id) AS isFollowing, (SELECT COUNT(*) FROM follows f WHERE f.following_id = p.id) AS followersCount, (SELECT COUNT(*) FROM follows f WHERE f.follower_id = p.id) AS followingCount, (SELECT id FROM connection_requests cr WHERE cr.requester_id = p.id AND cr.recipient_id = ? AND cr.status = 'pending' LIMIT 1) AS incomingRequestId, (SELECT status FROM connection_requests cr WHERE (cr.requester_id = ? AND cr.recipient_id = p.id) OR (cr.requester_id = p.id AND cr.recipient_id = ?) ORDER BY cr.id DESC LIMIT 1) AS connectionStatus FROM (" + profileSelect() + ") p WHERE p.id != ? AND (? = '%%' OR p.username LIKE ? OR p.fullName LIKE ? OR p.bio LIKE ? OR p.professionalTitle LIKE ? OR p.organization LIKE ? OR p.department LIKE ?) ORDER BY p.username COLLATE NOCASE LIMIT 50";
  const users = db.prepare(sql).all(req.auth.userId, req.auth.userId, req.auth.userId, req.auth.userId, req.auth.userId, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  res.json({ users });
});

router.post("/follow/:userId", (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isSafeInteger(targetId) || targetId < 1 || targetId === req.auth.userId) return res.status(400).json({ error: "Choose a valid member to follow." });
  const target = db.prepare("SELECT id, username FROM users WHERE id = ?").get(targetId);
  if (!target) return res.status(404).json({ error: "Member not found." });
  const result = db.prepare("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)").run(req.auth.userId, targetId);
  if (result.changes) notify(targetId, req.auth.userId, "follow", targetId, "started following you");
  res.json({ message: "You are now following " + target.username + "." });
});
router.delete("/follow/:userId", (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isSafeInteger(targetId) || targetId < 1) return res.status(400).json({ error: "Invalid member." });
  db.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").run(req.auth.userId, targetId);
  res.json({ message: "You have unfollowed this member." });
});

router.post("/connect/:userId", (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isSafeInteger(targetId) || targetId < 1 || targetId === req.auth.userId) return res.status(400).json({ error: "Choose a valid member." });
  const target = db.prepare("SELECT id, username FROM users WHERE id = ?").get(targetId);
  if (!target) return res.status(404).json({ error: "Member not found." });
  const incoming = db.prepare("SELECT id FROM connection_requests WHERE requester_id = ? AND recipient_id = ? AND status = 'pending'").get(targetId, req.auth.userId);
  if (incoming) return res.status(409).json({ error: "This member has already requested to connect. Please respond to their request." });
  const existing = db.prepare("SELECT id, status FROM connection_requests WHERE requester_id = ? AND recipient_id = ? ORDER BY id DESC LIMIT 1").get(req.auth.userId, targetId);
  if (existing && existing.status === "pending") return res.status(409).json({ error: "Your connection request is already pending." });
  if (existing && existing.status === "accepted") return res.status(409).json({ error: "You are already connected." });
  const result = db.prepare("INSERT INTO connection_requests (requester_id, recipient_id, status) VALUES (?, ?, 'pending')").run(req.auth.userId, targetId);
  notify(targetId, req.auth.userId, "connection_request", result.lastInsertRowid, "sent you a connection request");
  res.status(201).json({ message: "Connection request sent to " + target.username + "." });
});

router.get("/requests", (req, res) => {
  const incoming = db.prepare("SELECT cr.id, cr.created_at AS createdAt, u.id AS userId, u.username, u.full_name AS fullName, CASE WHEN u.profile_mode IN ('personal','both') THEN u.bio ELSE '' END AS bio, CASE WHEN u.profile_mode IN ('professional','both') THEN u.professional_title ELSE '' END AS professionalTitle, CASE WHEN u.profile_mode IN ('professional','both') THEN u.organization ELSE '' END AS organization, u.avatar_path AS avatarPath FROM connection_requests cr JOIN users u ON u.id = cr.requester_id WHERE cr.recipient_id = ? AND cr.status = 'pending' ORDER BY cr.id DESC LIMIT 50").all(req.auth.userId);
  const outgoing = db.prepare("SELECT cr.id, cr.created_at AS createdAt, u.id AS userId, u.username, u.full_name AS fullName FROM connection_requests cr JOIN users u ON u.id = cr.recipient_id WHERE cr.requester_id = ? AND cr.status = 'pending' ORDER BY cr.id DESC LIMIT 50").all(req.auth.userId);
  res.json({ incoming, outgoing });
});

router.post("/requests/:requestId/respond", (req, res) => {
  const requestId = Number(req.params.requestId);
  const action = String(req.body.action || "");
  if (!Number.isSafeInteger(requestId) || !["accept", "decline"].includes(action)) return res.status(400).json({ error: "Choose accept or decline." });
  const request = db.prepare("SELECT id, requester_id AS requesterId, recipient_id AS recipientId FROM connection_requests WHERE id = ? AND recipient_id = ? AND status = 'pending'").get(requestId, req.auth.userId);
  if (!request) return res.status(404).json({ error: "Pending request not found." });
  if (action === "accept") {
    db.transaction(() => {
      db.prepare("UPDATE connection_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(requestId);
      db.prepare("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)").run(request.requesterId, request.recipientId);
      db.prepare("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)").run(request.recipientId, request.requesterId);
    })();
    notify(request.requesterId, req.auth.userId, "connection_accepted", requestId, "accepted your connection request");
    return res.json({ message: "Connection accepted." });
  }
  db.prepare("UPDATE connection_requests SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(requestId);
  res.json({ message: "Request declined." });
});

router.get("/followers", (req, res) => {
  const users = db.prepare(profileSelect() + " JOIN follows f ON f.follower_id = u.id WHERE f.following_id = ? ORDER BY u.username COLLATE NOCASE LIMIT 100").all(req.auth.userId);
  res.json({ users });
});

router.get("/following", (req, res) => {
  const users = db.prepare(profileSelect() + " JOIN follows f ON f.following_id = u.id WHERE f.follower_id = ? ORDER BY u.username COLLATE NOCASE LIMIT 100").all(req.auth.userId);
  res.json({ users });
});

router.get("/feed", (req, res) => {
  const posts = db.prepare("SELECT p.id, p.user_id AS userId, u.username, u.full_name AS fullName, u.avatar_path AS avatarPath, p.content, p.created_at AS createdAt, (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likeCount, (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS commentCount, EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS likedByMe FROM posts p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) ORDER BY p.id DESC LIMIT 50").all(req.auth.userId, req.auth.userId, req.auth.userId);
  res.json({ posts });
});
router.post("/posts", (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content || content.length > 2000) return res.status(400).json({ error: "A post must contain 1–2000 characters." });
  const result = db.prepare("INSERT INTO posts (user_id, content) VALUES (?, ?)").run(req.auth.userId, content);
  const post = db.prepare("SELECT p.id, p.user_id AS userId, u.username, u.full_name AS fullName, p.content, p.created_at AS createdAt, 0 AS likeCount, 0 AS commentCount, 0 AS likedByMe FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?").get(result.lastInsertRowid);
  res.status(201).json({ post });
});

router.post("/posts/:postId/like", (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isSafeInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post." });
  const post = db.prepare("SELECT id, user_id AS userId FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found." });
  const existing = db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?").get(postId, req.auth.userId);
  if (existing) {
    db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(postId, req.auth.userId);
    return res.json({ liked: false, message: "Like removed." });
  }
  db.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)").run(postId, req.auth.userId);
  notify(post.userId, req.auth.userId, "like", postId, "liked your post");
  res.json({ liked: true, message: "Post liked." });
});

router.get("/posts/:postId/comments", (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isSafeInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post." });
  if (!db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  const comments = db.prepare("SELECT c.id, c.user_id AS userId, u.username, u.full_name AS fullName, c.content, c.created_at AS createdAt FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 100").all(postId);
  res.json({ comments });
});
router.post("/posts/:postId/comments", (req, res) => {
  const postId = Number(req.params.postId);
  const content = String(req.body.content || "").trim();
  if (!Number.isSafeInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post." });
  if (!content || content.length > 1000) return res.status(400).json({ error: "A comment must contain 1–1000 characters." });
  const post = db.prepare("SELECT id, user_id AS userId FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "Post not found." });
  const result = db.prepare("INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)").run(postId, req.auth.userId, content);
  notify(post.userId, req.auth.userId, "comment", postId, "commented on your post");
  const comment = db.prepare("SELECT c.id, c.user_id AS userId, u.username, u.full_name AS fullName, c.content, c.created_at AS createdAt FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?").get(result.lastInsertRowid);
  res.status(201).json({ comment });
});

router.get("/notifications", (req, res) => {
  const notifications = db.prepare("SELECT n.id, n.type, n.entity_id AS entityId, n.message, n.is_read AS isRead, n.created_at AS createdAt, u.username AS actorUsername, u.full_name AS actorFullName FROM notifications n LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 100").all(req.auth.userId);
  res.json({ notifications });
});
router.post("/notifications/read", (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.auth.userId);
  res.json({ message: "Notifications marked as read." });
});

module.exports = router;
