"use strict";

const PROFILE_BACKGROUNDS = new Set([
  "mist", "ocean", "lavender", "sunset", "forest", "slate", "aurora",
  "midnight", "rose", "graphite", "pearl", "neon", "ocean-glass", "cosmic"
]);
const PROFILE_MODES = new Set(["personal", "professional", "both"]);

class AuthServiceError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = "AuthServiceError";
    this.status = status;
    this.code = code;
  }
}

function createPostgresAuthService({ db, bcrypt, jwt, jwtSecret }) {
  if (!db || typeof db.one !== "function" || typeof db.execute !== "function") {
    throw new TypeError("A PostgreSQL adapter is required.");
  }
  if (!bcrypt || typeof bcrypt.hash !== "function" || typeof bcrypt.compare !== "function") {
    throw new TypeError("A bcrypt-compatible implementation is required.");
  }
  if (!jwt || typeof jwt.sign !== "function") {
    throw new TypeError("A JWT implementation is required.");
  }

  async function register({ username: rawUsername, password: rawPassword }) {
    const username = String(rawUsername || "").trim();
    const password = String(rawPassword || "");
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      throw new AuthServiceError(400, "Username must be 3–30 characters using letters, numbers, or underscores.", "INVALID_USERNAME");
    }
    if (password.length < 12 || password.length > 128) {
      throw new AuthServiceError(400, "Password must be between 12 and 128 characters.", "INVALID_PASSWORD");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await db.one(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
        [username, passwordHash]
      );
      if (!user) throw new Error("PostgreSQL did not return the inserted user.");
      return { message: "Account created successfully.", user: { id: user.id, username: user.username } };
    } catch (error) {
      if (error && error.code === "23505") {
        throw new AuthServiceError(409, "That username is already taken.", "USERNAME_TAKEN");
      }
      throw error;
    }
  }

  async function login({ username: rawUsername, password: rawPassword }) {
    const username = String(rawUsername || "").trim();
    const password = String(rawPassword || "");
    const user = await db.one(
      "SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) throw new AuthServiceError(401, "Invalid username or password.", "INVALID_CREDENTIALS");
    if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
      throw new AuthServiceError(500, "Server authentication secret is not configured.", "JWT_SECRET_NOT_CONFIGURED");
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      jwtSecret,
      { expiresIn: "2h", issuer: "waltajjii", audience: "waltajjii-users" }
    );
    return { message: "Login successful.", token, user: { id: user.id, username: user.username } };
  }

  async function getProfile(userId) {
    const user = await db.one(`
      SELECT id, username, full_name AS "fullName", bio,
             profile_background AS "profileBackground",
             professional_title AS "professionalTitle",
             organization, department, location, website,
             profile_mode AS "profileMode", avatar_path AS "avatarPath"
      FROM users WHERE id = $1
    `, [userId]);
    if (!user) throw new AuthServiceError(404, "Account not found.", "ACCOUNT_NOT_FOUND");
    return { user };
  }

  async function updateProfile(userId, input = {}) {
    const fullName = String(input.fullName || "").trim();
    const profileBackground = String(input.profileBackground || "mist").trim();
    const bio = String(input.bio || "").trim();
    const professionalTitle = String(input.professionalTitle || "").trim();
    const organization = String(input.organization || "").trim();
    const department = String(input.department || "").trim();
    const location = String(input.location || "").trim();
    const website = String(input.website || "").trim();
    const profileMode = String(input.profileMode || "both").trim();

    if (fullName.length > 120 || bio.length > 160 || professionalTitle.length > 100 ||
        organization.length > 120 || department.length > 120 ||
        location.length > 100 || website.length > 200) {
      throw new AuthServiceError(400, "One or more profile fields exceed their character limits.", "PROFILE_FIELD_TOO_LONG");
    }
    if (!PROFILE_BACKGROUNDS.has(profileBackground)) {
      throw new AuthServiceError(400, "Choose one of the available profile backgrounds.", "INVALID_PROFILE_BACKGROUND");
    }
    if (!PROFILE_MODES.has(profileMode)) {
      throw new AuthServiceError(400, "Invalid profile display preference.", "INVALID_PROFILE_MODE");
    }
    if (website && !/^https?:\/\//i.test(website)) {
      throw new AuthServiceError(400, "Website must begin with http:// or https://.", "INVALID_WEBSITE");
    }

    const updated = await db.one(`
      UPDATE users SET full_name = $1, profile_background = $2, bio = $3,
        professional_title = $4, organization = $5, department = $6,
        location = $7, website = $8, profile_mode = $9
      WHERE id = $10
      RETURNING id
    `, [fullName, profileBackground, bio, professionalTitle, organization,
      department, location, website, profileMode, userId]);
    if (!updated) throw new AuthServiceError(404, "Account not found.", "ACCOUNT_NOT_FOUND");
    return { message: "Profile updated successfully.", fullName, profileBackground, bio,
      professionalTitle, organization, department, location, website, profileMode };
  }

  return Object.freeze({ register, login, getProfile, updateProfile });
}

module.exports = { createPostgresAuthService, AuthServiceError };
