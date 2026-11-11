"use strict";
const express = require("express");
const { createPostgresAuthRouter } = require("../routes/postgres-auth");
const { createPostgresPresenceRouter } = require("../routes/postgres-presence");

/**
 * Creates an isolated HTTP application for PostgreSQL integration testing.
 * All persistence and token dependencies are injected; this module never
 * creates a database pool, opens a connection, or modifies the SQLite server.
 */
function createPostgresTestApp({ authService, realtimeService, jwt, jwtSecret, authLimiter } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  app.get("/health", (req, res) => res.json({ status: "ok", database: "injected-postgres-adapter" }));
  app.use("/api/auth", createPostgresAuthRouter({
    authService, jwt, jwtSecret, limiter: authLimiter
  }));
  app.use("/api/presence", createPostgresPresenceRouter({
    realtimeService, jwt, jwtSecret
  }));
  return app;
}

module.exports = { createPostgresTestApp };
