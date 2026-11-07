const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

// Temporary, token-protected, online SQLite snapshot export.
// Configure WALTAJJII_BACKUP_TOKEN in the test service only.
router.get("/export", async (req, res) => {
  const configuredToken = process.env.WALTAJJII_BACKUP_TOKEN || "";
  const suppliedToken = req.get("x-backup-token") || "";

  if (configuredToken.length < 32) {
    return res.status(503).json({ error: "Backup export is not configured." });
  }

  const expected = Buffer.from(configuredToken, "utf8");
  const supplied = Buffer.from(suppliedToken, "utf8");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const filePath = path.join(os.tmpdir(), `waltajjii-backup-${crypto.randomUUID()}.sqlite`);

  try {
    // better-sqlite3's backup API creates a consistent snapshot while the DB is open.
    await db.backup(filePath);
    res.download(filePath, "waltajjii-database-backup.sqlite", (error) => {
      fs.promises.unlink(filePath).catch(() => {});
      if (error && !res.headersSent) {
        res.status(500).json({ error: "Could not deliver the database backup." });
      }
    });
  } catch (error) {
    fs.promises.unlink(filePath).catch(() => {});
    console.error("Database backup export failed:", error.message);
    if (!res.headersSent) res.status(500).json({ error: "Database backup failed." });
  }
});

module.exports = router;
