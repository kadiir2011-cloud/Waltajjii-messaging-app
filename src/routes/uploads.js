const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../db");
const storageService = require("../storage");

const router = express.Router();

const uploadDir = process.env.STORAGE_DIR
  ? path.join(process.env.STORAGE_DIR, "uploads")
  : path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

const allowedTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt"
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(allowedTypes, file.mimetype)) {
      return cb(new Error("Unsupported file type."));
    }
    cb(null, true);
  }
});

async function storeFile(file, maxBytes, typeMap) {
  const extension = typeMap[file.mimetype];
  if (!extension) throw new Error("Unsupported file type.");
  if (!file.buffer || file.size > maxBytes) throw new Error("File size limit exceeded.");
  const filename = crypto.randomUUID() + extension;
  if (storageService.configured) {
    await storageService.uploadObject(filename, file.buffer, file.mimetype);
  } else {
    fs.writeFileSync(path.join(uploadDir, filename), file.buffer, { flag: "wx" });
  }
  return filename;
}

async function sendStoredFile(filename, res, options = {}) {
  if (storageService.configured) {
    try {
      const buffer = await storageService.downloadObject(filename);
      if (buffer) {
        res.setHeader("Content-Type", options.contentType || "application/octet-stream");
        if (options.attachment) res.setHeader("Content-Disposition", "attachment");
        return res.send(buffer);
      }
    } catch (error) {
      console.error("Supabase download failed:", error.message);
      if (!fs.existsSync(path.join(uploadDir, filename))) {
        return res.status(502).json({ error: "File storage is temporarily unavailable." });
      }
    }
  }
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  return res.sendFile(filePath, options.attachment
    ? { headers: { "Content-Disposition": "attachment" } }
    : {}, error => {
      if (error && !res.headersSent) res.status(404).end();
    });
}

router.post("/", authenticate, (req, res) => {
  upload.single("media")(req, res, async err => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE"
        ? "File is too large. Maximum size is 10 MB."
        : err.message || "Upload failed.";
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Please select a file." });
    try {
      const filename = await storeFile(req.file, MAX_FILE_SIZE, allowedTypes);
      const mediaType = req.file.mimetype.startsWith("image/")
        ? "image"
        : req.file.mimetype.startsWith("video/") ? "video" : "document";
      return res.status(201).json({
        message: "File uploaded successfully.",
        fileId: filename,
        mediaType
      });
    } catch (error) {
      console.error("Media upload failed:", error.message);
      return res.status(500).json({ error: "Could not store the uploaded file." });
    }
  });
});

router.get("/:filename", authenticate, async (req, res) => {
  const filename = String(req.params.filename || "");
  if (!/^[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(filename)) {
    return res.status(400).json({ error: "Invalid media filename." });
  }
  const message = db.prepare(`
    SELECT id FROM messages
    WHERE media_path = ? AND (sender_id = ? OR receiver_id = ?)
    LIMIT 1
  `).get(filename, req.auth.userId, req.auth.userId);
  if (!message) return res.status(404).json({ error: "Media not found." });
  const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(filename);
  return sendStoredFile(filename, res, { attachment: isDocument });
});

// Profile pictures: JPG, PNG or WebP, maximum 2 MB.
const profileImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(profileImageTypes, file.mimetype)) {
      return cb(new Error("Please use a JPG, PNG or WebP image."));
    }
    cb(null, true);
  }
});

router.post("/profile-picture", authenticate, (req, res) => {
  profileImageUpload.single("avatar")(req, res, async err => {
    if (err) {
      return res.status(400).json({
        error: err.code === "LIMIT_FILE_SIZE"
          ? "Profile picture must be 2 MB or smaller."
          : err.message || "Picture upload failed."
      });
    }
    if (!req.file) return res.status(400).json({ error: "Please select a JPG, PNG or WebP picture." });
    try {
      const user = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(req.auth.userId);
      if (!user) return res.status(404).json({ error: "Account not found." });
      const filename = await storeFile(req.file, 2 * 1024 * 1024, profileImageTypes);
      db.prepare("UPDATE users SET avatar_path = ? WHERE id = ?").run(filename, req.auth.userId);
      if (user.avatar_path) {
        if (storageService.configured) {
          try { await storageService.removeObject(user.avatar_path); }
          catch (error) { console.error("Old profile picture cleanup failed:", error.message); }
        }
        const oldPath = path.join(uploadDir, user.avatar_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      return res.json({ message: "Profile picture updated.", avatarPath: filename });
    } catch (error) {
      console.error("Profile picture upload failed:", error.message);
      return res.status(500).json({ error: "Could not store the profile picture." });
    }
  });
});

router.delete("/profile-picture", authenticate, async (req, res) => {
  const user = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(req.auth.userId);
  if (user && user.avatar_path) {
    if (storageService.configured) {
      try { await storageService.removeObject(user.avatar_path); }
      catch (error) { console.error("Profile picture cleanup failed:", error.message); }
    }
    const oldPath = path.join(uploadDir, user.avatar_path);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare("UPDATE users SET avatar_path = NULL WHERE id = ?").run(req.auth.userId);
  return res.json({ message: "Profile picture removed." });
});

router.get("/profile-picture/:userId", authenticate, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: "Invalid user." });
  const user = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(userId);
  if (!user || !user.avatar_path) return res.status(404).json({ error: "Profile picture not found." });
  if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(user.avatar_path)) {
    return res.status(404).json({ error: "Profile picture not found." });
  }
  return sendStoredFile(user.avatar_path, res);
});

module.exports = router;
