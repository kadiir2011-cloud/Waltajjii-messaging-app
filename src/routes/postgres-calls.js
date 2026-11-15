"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");

function createPostgresCallsRouter({ jwtSecret, jwtImplementation = jwt, apiKey = process.env.METERED_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) throw new TypeError("A strong JWT secret is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const router = express.Router();
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
  router.get("/turn-credentials", async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: "Video calling is not configured yet. Please contact the administrator." });
    try {
      const response = await fetchImpl("https://waltajjii-calls.metered.live/api/v1/turn/credentials?apiKey=" + encodeURIComponent(apiKey));
      if (!response.ok) {
        console.error("Metered TURN credential request failed:", response.status);
        return res.status(502).json({ error: "Could not load video-call network settings." });
      }
      const iceServers = await response.json();
      if (!Array.isArray(iceServers) || iceServers.length === 0) return res.status(502).json({ error: "The video-call provider returned no network servers." });
      return res.json({ iceServers });
    } catch (error) {
      console.error("TURN credential request error:", error?.message || "Unknown error");
      return res.status(502).json({ error: "Video-call network settings are temporarily unavailable." });
    }
  });
  return router;
}

module.exports = { createPostgresCallsRouter };
