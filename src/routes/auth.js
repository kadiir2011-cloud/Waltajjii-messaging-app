const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { validateNewPassword } = require("../security/password-policy");

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

    const passwordError = validateNewPassword(password, username);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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

    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
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
    req.auth = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "waltajjii",
      audience: "waltajjii-users"
    });
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
module.exports = router;
