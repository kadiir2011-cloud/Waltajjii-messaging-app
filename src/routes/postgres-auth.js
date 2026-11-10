"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");

/**
 * Test-only/injected PostgreSQL authentication router.
 * It deliberately does not import the SQLite database or create a Pool.
 * The caller must inject an already-created auth service and JWT verifier.
 */
function createPostgresAuthRouter({ authService, jwt, jwtSecret, limiter } = {}) {
  if (!authService || !["register", "login", "getProfile", "updateProfile"].every(
    name => typeof authService[name] === "function"
  )) throw new TypeError("A complete PostgreSQL authentication service is required.");
  if (!jwt || typeof jwt.verify !== "function") {
    throw new TypeError("A JWT implementation with verify() is required.");
  }

  const router = express.Router();
  const authLimiter = limiter || rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false
  });

  function authenticateProfile(req, res, next) {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Login required." });
    }
    if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
      return res.status(500).json({ error: "Server authentication secret is not configured." });
    }
    try {
      req.auth = jwt.verify(token, jwtSecret, {
        issuer: "waltajjii",
        audience: "waltajjii-users"
      });
      if (!req.auth || !req.auth.userId) {
        return res.status(401).json({ error: "Invalid or expired login token." });
      }
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired login token." });
    }
  }

  function handleServiceError(res, error, fallback) {
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
      return res.status(error.status).json({ error: error.message });
    }
    // Avoid leaking SQL, connection strings, or provider diagnostics to clients.
    console.error(fallback + ":", error?.message || "Unknown error");
    return res.status(500).json({ error: fallback });
  }

  router.post("/register", authLimiter, async (req, res) => {
    try {
      const result = await authService.register(req.body || {});
      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Could not create account.");
    }
  });

  router.post("/login", authLimiter, async (req, res) => {
    try {
      const result = await authService.login(req.body || {});
      return res.json(result);
    } catch (error) {
      return handleServiceError(res, error, "Could not log in.");
    }
  });

  router.get("/profile", authenticateProfile, async (req, res) => {
    try {
      const result = await authService.getProfile(req.auth.userId);
      return res.json(result);
    } catch (error) {
      return handleServiceError(res, error, "Could not retrieve profile.");
    }
  });

  router.patch("/profile", authenticateProfile, async (req, res) => {
    try {
      const result = await authService.updateProfile(req.auth.userId, req.body || {});
      return res.json(result);
    } catch (error) {
      return handleServiceError(res, error, "Could not update profile.");
    }
  });

  return router;
}

module.exports = { createPostgresAuthRouter };
