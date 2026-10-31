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

    const result = db.prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)"
    ).run(username, passwordHash);

    return res.status(201).json({
      message: "Account created successfully.",
      user: { id: result.lastInsertRowid, username }
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
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

    const user = db.prepare(
      "SELECT id, username, password_hash FROM users WHERE username = ?"
    ).get(username);

    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

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

module.exports = router;
