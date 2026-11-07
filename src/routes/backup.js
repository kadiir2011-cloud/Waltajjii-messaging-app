const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Temporary Basic-auth protected online SQLite snapshot export.
// Configure WALTAJJII_BACKUP_USER and WALTAJJII_BACKUP_PASSWORD on the test service only.
router.get("/export", async (req, res) => {
  const expectedUser = process.env.WALTAJJII_BACKUP_USER || "";
  const expectedPassword = process.env.WALTAJJII_BACKUP_PASSWORD || "";
  const header = req.get("authorization") || "";
  const match = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);

  if (expectedUser.length < 4 || expectedPassword.length < 24) {
    return res.status(503).json({ error: "Backup export is not configured." });
  }

  let suppliedUser = "";
  let suppliedPassword = "";
  if (match) {
    try {
      const decoded = Buffer.from(match[1], "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator >= 0) {
        suppliedUser = decoded.slice(0, separator);
        suppliedPassword = decoded.slice(separator + 1);
      }
    } catch {}
  }

  if (!safeEqual(suppliedUser, expectedUser) || !safeEqual(suppliedPassword, expectedPassword)) {
    res.set("WWW-Authenticate", 'Basic realm="Waltajjii temporary database backup", charset="UTF-8"');
    return res.status(401).send("Authentication required.");
  }

  const filePath = path.join(os.tmpdir(), `waltajjii-backup-${crypto.randomUUID()}.sqlite`);

  try {
    // better-sqlite3 creates a consistent snapshot while the live database remains open.
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
