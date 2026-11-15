"use strict";
const express = require("express");

function createPostgresPresenceRouter({ realtimeService, jwt, jwtSecret } = {}) {
  if (!realtimeService || typeof realtimeService.getOnlineProfiles !== "function") {
    throw new TypeError("A PostgreSQL realtime service is required.");
  }
  if (!jwt || typeof jwt.verify !== "function") {
    throw new TypeError("A JWT implementation with verify() is required.");
  }
  const router = express.Router();

  router.get("/online", async (req, res) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Login required." });
    }
    if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
      return res.status(500).json({ error: "Server authentication secret is not configured." });
    }
    let viewer;
    try {
      viewer = jwt.verify(token, jwtSecret, {
        issuer: "waltajjii",
        audience: "waltajjii-users"
      });
    } catch {
      return res.status(401).json({ error: "Invalid or expired login token." });
    }
    if (!viewer || !viewer.userId) {
      return res.status(401).json({ error: "Invalid or expired login token." });
    }

    try {
      const onlineUserIds = req.app.get("onlineUserIds") || [];
      const users = await realtimeService.getOnlineProfiles(onlineUserIds, viewer.userId);
      res.set("Cache-Control", "no-store");
      return res.json({ users });
    } catch (error) {
      console.error("PostgreSQL presence lookup failed:", error?.message || "Unknown error");
      return res.status(500).json({ error: "Could not retrieve online members." });
    }
  });

  return router;
}

module.exports = { createPostgresPresenceRouter };
