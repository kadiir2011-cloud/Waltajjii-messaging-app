const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Readable } = require("stream");
const db = require("../db");

const router = express.Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PROFILE_IMAGE_MAX_SIZE = 2 * 1024 * 1024;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "waltajjii-media";

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
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt"
};

const profileImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
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

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_IMAGE_MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(profileImageTypes, file.mimetype)) {
      return cb(new Error("Please use a JPG, PNG or WebP image."));
    }
    cb(null, true);
  }
});

function storageConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase Storage environment variables are missing.");
  return { url: url.replace(/\/$/, ""), key };
}

async function storageRequest(path, options = {}) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Supabase Storage request failed (${response.status}). ${detail}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function storeFile(file, filename) {
  await storageRequest(
    `object/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": file.mimetype,
        "x-upsert": "true"
      },
      body: file.buffer
    }
  );
}

async function removeFile(filename) {
  if (!filename) return;
  await storageRequest(`object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [filename] })
  });
}

async function sendStoredFile(filename, res, attachment = false) {
  const response = await storageRequest(
    `object/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`
  );
  res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
  res.setHeader("Cache-Control", "private, no-store");
  if (attachment) res.setHeader("Content-Disposition", "attachment");
  Readable.fromWeb(response.body).pipe(res);
}

function uploadError(res, err, profile = false) {
  const message = err.code === "LIMIT_FILE_SIZE"
    ? (profile ? "Profile picture must be 2 MB or smaller." : "File is too large. Maximum size is 10 MB.")
    : err.message || "Upload failed.";
  return res.status(400).json({ error: message });
}

router.post("/", authenticate, (req, res) => {
  upload.single("media")(req, res, async (err) => {
    if (err) return uploadError(res, err);
    if (!req.file) return res.status(400).json({ error: "Please select a file." });

    const fileId = crypto.randomUUID() + allowedTypes[req.file.mimetype];
    const mediaType = req.file.mimetype.startsWith("image/")
      ? "image"
      : req.file.mimetype.startsWith("video/")
        ? "video"
        : "document";

    try {
      await storeFile(req.file, fileId);
      res.status(201).json({
        message: "File uploaded successfully.",
        fileId,
        mediaType
      });
    } catch (error) {
      console.error("Media upload failed:", error);
      res.status(502).json({ error: "Could not store the uploaded file." });
    }
  });
});

router.get("/:filename", authenticate, async (req, res) => {
  const filename = String(req.params.filename || "");
  if (!/^[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(filename)) {
    return res.status(400).json({ error: "Invalid media filename." });
  }

  try {
    const result = await db.query(
      `SELECT id FROM messages
       WHERE media_path = $1 AND (sender_id = $2 OR receiver_id = $2)
       LIMIT 1`,
      [filename, req.auth.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Media not found." });

    const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(filename);
    await sendStoredFile(filename, res, isDocument);
  } catch (error) {
    console.error("Media retrieval failed:", error);
    if (!res.headersSent) res.status(502).json({ error: "Could not retrieve media." });
  }
});

router.post("/profile-picture", authenticate, (req, res) => {
  profileImageUpload.single("avatar")(req, res, async (err) => {
    if (err) return uploadError(res, err, true);
    if (!req.file) return res.status(400).json({ error: "Please select a JPG, PNG or WebP picture." });

    const filename = crypto.randomUUID() + profileImageTypes[req.file.mimetype];
    try {
      const userResult = await db.query(
        "SELECT avatar_path FROM users WHERE id = $1",
        [req.auth.userId]
      );
      const user = userResult.rows[0];
      if (!user) return res.status(404).json({ error: "Account not found." });

      await storeFile(req.file, filename);
      await db.query(
        "UPDATE users SET avatar_path = $1 WHERE id = $2",
        [filename, req.auth.userId]
      );
      if (user.avatar_path) {
        try { await removeFile(user.avatar_path); }
        catch (cleanupError) { console.error("Old avatar cleanup failed:", cleanupError); }
      }
      res.json({ message: "Profile picture updated.", avatarPath: filename });
    } catch (error) {
      console.error("Profile picture upload failed:", error);
      res.status(502).json({ error: "Could not update profile picture." });
    }
  });
});

router.delete("/profile-picture", authenticate, async (req, res) => {
  try {
    const userResult = await db.query(
      "SELECT avatar_path FROM users WHERE id = $1",
      [req.auth.userId]
    );
    if (!userResult.rowCount) return res.status(404).json({ error: "Account not found." });

    const oldPath = userResult.rows[0].avatar_path;
    await db.query("UPDATE users SET avatar_path = NULL WHERE id = $1", [req.auth.userId]);
    if (oldPath) {
      try { await removeFile(oldPath); }
      catch (cleanupError) { console.error("Avatar cleanup failed:", cleanupError); }
    }
    res.json({ message: "Profile picture removed." });
  } catch (error) {
    console.error("Profile picture removal failed:", error);
    res.status(500).json({ error: "Could not remove profile picture." });
  }
});

router.get("/profile-picture/:userId", authenticate, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "Invalid user." });
  }
  try {
    const result = await db.query(
      "SELECT avatar_path FROM users WHERE id = $1",
      [userId]
    );
    const filename = result.rows[0]?.avatar_path;
    if (!filename || !/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(filename)) {
      return res.status(404).json({ error: "Profile picture not found." });
    }
    await sendStoredFile(filename, res);
  } catch (error) {
    console.error("Profile picture retrieval failed:", error);
    if (!res.headersSent) res.status(502).json({ error: "Could not retrieve profile picture." });
  }
});

module.exports = router;
