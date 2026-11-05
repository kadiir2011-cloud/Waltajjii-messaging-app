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

const MAX_MEDIA_SIZE = 10 * 1024 * 1024;
const mediaTypes = {
  "image/jpeg": { extension: ".jpg", type: "image" },
  "image/png": { extension: ".png", type: "image" },
  "image/webp": { extension: ".webp", type: "image" },
  "image/gif": { extension: ".gif", type: "image" },
  "video/mp4": { extension: ".mp4", type: "video" },
  "video/webm": { extension: ".webm", type: "video" }
};

function authenticate(req, res, next) {
  const [scheme, token] = String(req.headers.authorization || "").split(" ");
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
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(mediaTypes, file.mimetype)) {
      return cb(new Error("Moments support JPG, PNG, WebP, GIF, MP4 and WebM files."));
    }
    cb(null, true);
  }
});

async function storeMedia(file) {
  const config = mediaTypes[file.mimetype];
  if (!config || !file.buffer || file.size > MAX_MEDIA_SIZE) {
    throw new Error("Unsupported or oversized Moments media.");
  }
  const filename = crypto.randomUUID() + config.extension;
  if (storageService.configured) {
    await storageService.uploadObject(filename, file.buffer, file.mimetype);
  } else {
    fs.writeFileSync(path.join(uploadDir, filename), file.buffer, { flag: "wx" });
  }
  return { filename, type: config.type, contentType: file.mimetype };
}

async function readMedia(filename, contentType, res) {
  if (storageService.configured) {
    try {
      const buffer = await storageService.downloadObject(filename);
      if (buffer) {
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(buffer);
      }
    } catch (error) {
      console.error("Moment media download failed:", error.message);
      if (!fs.existsSync(path.join(uploadDir, filename))) {
        return res.status(502).json({ error: "Moment media is temporarily unavailable." });
      }
    }
  }
  const localPath = path.join(uploadDir, filename);
  if (!fs.existsSync(localPath)) return res.status(404).end();
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  return res.sendFile(localPath);
}

function visibleMomentQuery() {
  return `
    SELECT m.id, m.user_id AS userId, u.username, u.avatar_path AS avatarPath,
      m.content, m.media_path AS mediaPath, m.media_type AS mediaType,
      m.audience, m.created_at AS createdAt, m.expires_at AS expiresAt,
      CASE WHEN m.user_id = ? THEN 1 ELSE 0 END AS isMine
    FROM moments m
    JOIN users u ON u.id = m.user_id
    WHERE datetime(m.expires_at) > CURRENT_TIMESTAMP
      AND (
        m.user_id = ?
        OR m.audience = 'everyone'
        OR (m.audience = 'followers' AND EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_id = ? AND f.following_id = m.user_id
        ))
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 100
  `;
}

router.get("/", (req, res) => {
  const moments = db.prepare(visibleMomentQuery()).all(
    req.auth.userId, req.auth.userId, req.auth.userId
  );
  res.json({ moments });
});

router.post("/", (req, res) => {
  upload.single("media")(req, res, async error => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Moment media must be 10 MB or smaller."
        : error.message || "Moment upload failed.";
      return res.status(400).json({ error: message });
    }

    const content = String(req.body.content || "").trim();
    const audience = String(req.body.audience || "followers");
    if (content.length > 500) {
      return res.status(400).json({ error: "Moment text must be 500 characters or fewer." });
    }
    if (!["everyone", "followers"].includes(audience)) {
      return res.status(400).json({ error: "Choose a valid Moment audience." });
    }
    if (!content && !req.file) {
      return res.status(400).json({ error: "Add text or choose a photo/video." });
    }

    let stored = null;
    try {
      if (req.file) stored = await storeMedia(req.file);
      const result = db.prepare(`
        INSERT INTO moments (user_id, content, media_path, media_type, audience)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.auth.userId, content, stored?.filename || null,
        stored?.type || null, audience
      );
      const moment = db.prepare(`
        SELECT m.id, m.user_id AS userId, u.username, m.content,
          m.media_path AS mediaPath, m.media_type AS mediaType,
          m.audience, m.created_at AS createdAt, m.expires_at AS expiresAt,
          1 AS isMine
        FROM moments m JOIN users u ON u.id = m.user_id WHERE m.id = ?
      `).get(result.lastInsertRowid);
      return res.status(201).json({ moment });
    } catch (storeError) {
      if (stored) {
        try {
          if (storageService.configured) await storageService.removeObject(stored.filename);
          else fs.rmSync(path.join(uploadDir, stored.filename), { force: true });
        } catch (cleanupError) {
          console.error("Moment media cleanup failed:", cleanupError.message);
        }
      }
      console.error("Moment creation failed:", storeError.message);
      return res.status(500).json({ error: "Could not publish this Moment." });
    }
  });
});

router.get("/media/:momentId", async (req, res) => {
  const momentId = Number(req.params.momentId);
  if (!Number.isSafeInteger(momentId) || momentId < 1) {
    return res.status(400).json({ error: "Invalid Moment." });
  }
  const moment = db.prepare(`
    SELECT m.media_path AS mediaPath, m.media_type AS mediaType,
      u.id AS ownerId, m.audience, m.expires_at AS expiresAt
    FROM moments m JOIN users u ON u.id = m.user_id WHERE m.id = ?
  `).get(momentId);
  if (!moment || !moment.mediaPath || new Date(moment.expiresAt + "Z").getTime() <= Date.now()) {
    return res.status(404).json({ error: "Moment not found or expired." });
  }
  const isVisible = Number(moment.ownerId) === Number(req.auth.userId)
    || moment.audience === "everyone"
    || (moment.audience === "followers" && db.prepare(
      "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
    ).get(req.auth.userId, moment.ownerId));
  if (!isVisible) return res.status(404).json({ error: "Moment not found." });

  const extension = path.extname(moment.mediaPath).toLowerCase();
  const contentTypes = {
    ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm"
  };
  return readMedia(moment.mediaPath, contentTypes[extension] || "application/octet-stream", res);
});

router.delete("/:momentId", async (req, res) => {
  const momentId = Number(req.params.momentId);
  if (!Number.isSafeInteger(momentId) || momentId < 1) {
    return res.status(400).json({ error: "Invalid Moment." });
  }
  const moment = db.prepare(
    "SELECT id, media_path AS mediaPath FROM moments WHERE id = ? AND user_id = ?"
  ).get(momentId, req.auth.userId);
  if (!moment) return res.status(404).json({ error: "Moment not found." });
  db.prepare("DELETE FROM moments WHERE id = ? AND user_id = ?").run(momentId, req.auth.userId);
  if (moment.mediaPath) {
    try {
      if (storageService.configured) await storageService.removeObject(moment.mediaPath);
      else fs.rmSync(path.join(uploadDir, moment.mediaPath), { force: true });
    } catch (error) {
      console.error("Deleted Moment media cleanup failed:", error.message);
    }
  }
  return res.json({ message: "Moment deleted." });
});

module.exports = router;
