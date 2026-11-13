const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { verifyAccessToken } = require("../security/access-token");

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
      "SELECT id, username, password_hash, token_version FROM users WHERE username = ?"
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
      { userId: user.id, username: user.username, tokenVersion: Number(user.token_version || 0) },
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
// Authenticate requests to profile endpoints.
function authenticateProfile(req, res, next) {
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

// Retrieve the logged-in user's profile.
router.get("/profile", authenticateProfile, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, full_name AS fullName, bio,
           profile_background AS profileBackground,
           professional_title AS professionalTitle,
           organization, department, location, website, profile_mode AS profileMode,
           avatar_path AS avatarPath
    FROM users WHERE id = ?
  `).get(req.auth.userId);

  if (!user) return res.status(404).json({ error: "Account not found." });

  res.json({ user });
});

// Update the logged-in user's brief bio.
router.patch("/profile", authenticateProfile, (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const profileBackground = String(req.body.profileBackground || "mist").trim();
  const bio = String(req.body.bio || "").trim();
  const professionalTitle = String(req.body.professionalTitle || "").trim();
  const organization = String(req.body.organization || "").trim();
  const department = String(req.body.department || "").trim();
  const location = String(req.body.location || "").trim();
  const website = String(req.body.website || "").trim();
  const profileMode = String(req.body.profileMode || "both").trim();

  if (fullName.length > 120 || bio.length > 160 || professionalTitle.length > 100 ||
      organization.length > 120 || department.length > 120 ||
      location.length > 100 || website.length > 200) {
    return res.status(400).json({ error: "One or more profile fields exceed their character limits." });
  }
  if (!["mist", "ocean", "lavender", "sunset", "forest", "slate", "aurora", "midnight", "rose", "graphite", "pearl", "neon", "ocean-glass", "cosmic"].includes(profileBackground)) {
    return res.status(400).json({ error: "Choose one of the available profile backgrounds." });
  }
  if (!["personal", "professional", "both"].includes(profileMode)) {
    return res.status(400).json({ error: "Invalid profile display preference." });
  }
  if (website && !/^https?:\/\//i.test(website)) {
    return res.status(400).json({ error: "Website must begin with http:// or https://." });
  }

  db.prepare(`UPDATE users SET full_name = ?, profile_background = ?, bio = ?, professional_title = ?, organization = ?,
    department = ?, location = ?, website = ?, profile_mode = ? WHERE id = ?`)
    .run(fullName, profileBackground, bio, professionalTitle, organization, department, location, website, profileMode, req.auth.userId);

  res.json({ message: "Profile updated successfully.", fullName, profileBackground, bio, professionalTitle,
    organization, department, location, website, profileMode });
});


// Change password after re-authenticating with the current password.
// All older access tokens are revoked; the current browser receives a fresh token.
router.post("/change-password", authenticateProfile, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ error: "New password must be between 12 and 128 characters." });
  }
  try {
    const user = db.prepare("SELECT id, username, password_hash, token_version FROM users WHERE id = ?")
      .get(req.auth.userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const nextVersion = Number(user.token_version || 0) + 1;
    db.prepare("UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?")
      .run(passwordHash, nextVersion, user.id);
    const token = jwt.sign(
      { userId: user.id, username: user.username, tokenVersion: nextVersion },
      process.env.JWT_SECRET,
      { expiresIn: "2h", issuer: "waltajjii", audience: "waltajjii-users" }
    );
    return res.json({ message: "Password changed. Other sessions have been signed out.", token });
  } catch (error) {
    console.error("Password change failed:", error.name || "Error");
    return res.status(500).json({ error: "Could not change password." });
  }
});

// Revoke every active session for this account, including the current token.
router.post("/logout-all", authenticateProfile, (req, res) => {
  const result = db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?")
    .run(req.auth.userId);
  if (!result.changes) return res.status(404).json({ error: "Account not found." });
  res.set("Cache-Control", "no-store");
  return res.json({ message: "All active sessions have been signed out. Please log in again." });
});

module.exports = router;
