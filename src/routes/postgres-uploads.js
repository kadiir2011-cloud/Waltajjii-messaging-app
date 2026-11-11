"use strict";

const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");

const FILE_TYPES = Object.freeze({
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/gif": "image",
  "video/mp4": "video", "video/webm": "video",
  "audio/webm": "document", "audio/ogg": "document", "audio/mp4": "document",
  "audio/mpeg": "document", "audio/wav": "document", "audio/x-wav": "document",
  "application/pdf": "document", "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "text/csv": "document", "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
  "text/plain": "document"
});
const PROFILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function createPostgresUploadsRouter({ mediaStorage, db, jwtSecret, jwtImplementation = jwt, uploadMiddleware, profileUploadMiddleware } = {}) {
  if (!mediaStorage || !["upload", "removeOwned", "downloadOwned", "downloadForViewer"].every(k => typeof mediaStorage[k] === "function")) throw new TypeError("A complete PostgreSQL media storage service is required.");
  if (!db || typeof db.one !== "function" || typeof db.execute !== "function") throw new TypeError("A PostgreSQL adapter is required.");
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) throw new TypeError("A strong JWT secret is required.");
  const router = express.Router();
  const generalUpload = uploadMiddleware || multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single("media");
  const avatarUpload = profileUploadMiddleware || multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single("avatar");
  router.use((req, res, next) => {
    const [scheme, token] = String(req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Login required." });
    try {
      req.auth = jwtImplementation.verify(token, jwtSecret, { issuer: "waltajjii", audience: "waltajjii-users" });
      if (!req.auth?.userId) return res.status(401).json({ error: "Invalid or expired login token." });
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired login token." });
    }
  });
  const handleUploadError = (error, res, profile = false) => {
    if (!error) return false;
    const limit = profile ? "Profile picture must be 2 MB or smaller." : "File is too large. Maximum size is 10 MB.";
    return res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? limit : error.message || "Upload failed." });
  };
  const sendMedia = (result, res, attachment = false) => {
    res.setHeader("Content-Type", result.metadata.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(result.buffer.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (attachment) res.setHeader("Content-Disposition", "attachment");
    return res.send(result.buffer);
  };

  router.post("/", (req, res) => generalUpload(req, res, async error => {
    if (handleUploadError(error, res)) return;
    if (!req.file) return res.status(400).json({ error: "Please select a file." });
    const mime = String(req.file.mimetype || "").split(";")[0].toLowerCase();
    const mediaType = FILE_TYPES[mime];
    if (!mediaType) return res.status(415).json({ error: "Unsupported file type." });
    try {
      const stored = await mediaStorage.upload(req.auth.userId, req.file, "message");
      return res.status(201).json({ message: "File uploaded successfully.", fileId: String(stored.id), mediaType });
    } catch (error) {
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error: error.message });
      console.error("PostgreSQL media upload failed:", error?.message || "Unknown error");
      return res.status(502).json({ error: "Could not store the uploaded file." });
    }
  }));

  router.get("/profile-picture/:userId", async (req, res) => {
    if (!/^[1-9][0-9]*$/.test(String(req.params.userId))) return res.status(400).json({ error: "Invalid user." });
    try {
      const user = await db.one("SELECT avatar_path AS \"avatarPath\" FROM users WHERE id=$1", [String(req.params.userId)]);
      if (!user?.avatarPath || !/^[1-9][0-9]*$/.test(String(user.avatarPath))) return res.status(404).json({ error: "Profile picture not found." });
      const result = await mediaStorage.downloadOwned(req.params.userId, user.avatarPath);
      return sendMedia(result, res);
    } catch (error) {
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error: error.message });
      console.error("PostgreSQL profile picture read failed:", error?.message || "Unknown error");
      return res.status(502).json({ error: "Profile picture is temporarily unavailable." });
    }
  });

  router.post("/profile-picture", (req, res) => avatarUpload(req, res, async error => {
    if (handleUploadError(error, res, true)) return;
    if (!req.file) return res.status(400).json({ error: "Please select a JPG, PNG or WebP picture." });
    const mime = String(req.file.mimetype || "").split(";")[0].toLowerCase();
    if (!PROFILE_TYPES.has(mime)) return res.status(415).json({ error: "Please use a JPG, PNG or WebP image." });
    try {
      const user = await db.one("SELECT avatar_path AS \"avatarPath\" FROM users WHERE id=$1", [String(req.auth.userId)]);
      if (!user) return res.status(404).json({ error: "Account not found." });
      stored = await mediaStorage.upload(req.auth.userId, req.file, "profile");
      const updated = await db.one("UPDATE users SET avatar_path=$1 WHERE id=$2 RETURNING id", [String(stored.id), String(req.auth.userId)]);
      if (!updated) {
        await mediaStorage.removeOwned(req.auth.userId, stored.id);
        return res.status(404).json({ error: "Account not found." });
      }
      if (user.avatarPath && /^[1-9][0-9]*$/.test(String(user.avatarPath))) {
        try { await mediaStorage.removeOwned(req.auth.userId, user.avatarPath); }
        catch (cleanupError) { console.error("Old profile picture cleanup failed:", cleanupError?.message || "Unknown error"); }
      }
      return res.json({ message: "Profile picture updated.", avatarPath: String(stored.id) });
    } catch (error) {
      if (stored?.id) { try { await mediaStorage.removeOwned(req.auth.userId, stored.id); } catch (cleanupError) { console.error("New profile picture rollback failed:", cleanupError?.message || "Unknown error"); } }
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error: error.message });
      console.error("PostgreSQL profile picture upload failed:", error?.message || "Unknown error");
      return res.status(502).json({ error: "Could not store the profile picture." });
    }
  }));

  router.delete("/profile-picture", async (req, res) => {
    try {
      const user = await db.one("SELECT avatar_path AS \"avatarPath\" FROM users WHERE id=$1", [String(req.auth.userId)]);
      if (user?.avatarPath && /^[1-9][0-9]*$/.test(String(user.avatarPath))) {
        await mediaStorage.removeOwned(req.auth.userId, user.avatarPath);
      }
      await db.execute("UPDATE users SET avatar_path=NULL WHERE id=$1", [String(req.auth.userId)]);
      return res.json({ message: "Profile picture removed." });
    } catch (error) {
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error: error.message });
      console.error("PostgreSQL profile picture removal failed:", error?.message || "Unknown error");
      return res.status(502).json({ error: "Could not remove the profile picture." });
    }
  });

  router.get("/:mediaId", async (req, res) => {
    if (!/^[1-9][0-9]*$/.test(String(req.params.mediaId))) return res.status(400).json({ error: "Invalid media reference." });
    try {
      const result = await mediaStorage.downloadForViewer(req.auth.userId, req.params.mediaId);
      const attachment = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain", "text/csv"].includes(result.metadata.mimeType);
      return sendMedia(result, res, attachment);
    } catch (error) {
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error: error.message });
      console.error("PostgreSQL media read failed:", error?.message || "Unknown error");
      return res.status(502).json({ error: "Media is temporarily unavailable." });
    }
  });

  return router;
}

module.exports = { createPostgresUploadsRouter, POSTGRES_UPLOAD_FILE_TYPES: FILE_TYPES };
