const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("../db");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

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

router.post("/register", authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–30 characters using letters, numbers, or underscores."
      });
    }
    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({
        error: "Password must be between 12 and 128 characters."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, passwordHash]
    );

    return res.status(201).json({
      message: "Account created successfully.",
      user: { id: result.rows[0].id, username: result.rows[0].username }
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    console.error("Registration error:", error.message);
    return res.status(500).json({ error: "Could not create account." });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const result = await db.query(
      "SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [username]
    );
    const user = result.rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      return res.status(500).json({
        error: "Server authentication secret is not configured."
      });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      secret,
      { expiresIn: "2h", issuer: "waltajjii", audience: "waltajjii-users" }
    );

    return res.json({
      message: "Login successful.",
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ error: "Could not log in." });
  }
});

router.get("/profile", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, username, bio, avatar_path AS \"avatarPath\" FROM users WHERE id = $1",
      [req.auth.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Account not found." });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Profile retrieval error:", error.message);
    res.status(500).json({ error: "Could not retrieve profile." });
  }
});

router.patch("/profile", authenticate, async (req, res) => {
  try {
    const bio = String(req.body.bio || "").trim();
    if (bio.length > 160) {
      return res.status(400).json({ error: "Bio must not exceed 160 characters." });
    }
    await db.query("UPDATE users SET bio = $1 WHERE id = $2", [bio, req.auth.userId]);
    res.json({ message: "Bio updated successfully.", bio });
  } catch (error) {
    console.error("Profile update error:", error.message);
    res.status(500).json({ error: "Could not update profile." });
  }
});

module.exports = router;
