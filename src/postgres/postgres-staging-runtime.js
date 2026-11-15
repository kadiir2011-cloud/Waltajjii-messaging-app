"use strict";

const { createPostgresAdapter } = require("../db/postgres-adapter");
const { createPostgresRuntimeServices } = require("./postgres-runtime-services");

function validatePostgresStagingConfig(config = {}) {
  if (config.appEnvironment !== "staging") {
    throw new TypeError("PostgreSQL runtime requires appEnvironment=staging.");
  }
  if (config.nodeEnvironment === "production") {
    throw new TypeError("A staging runtime cannot run with NODE_ENV=production.");
  }
  if (typeof config.databaseUrl !== "string" || !config.databaseUrl.trim()) {
    throw new TypeError("An isolated staging database URL is required.");
  }
  let parsed;
  try { parsed = new URL(config.databaseUrl); }
  catch { throw new TypeError("The staging database URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new TypeError("The staging database URL must use PostgreSQL.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/(^|[-_])(staging|stage|test|preview)([-_]|$)/i.test(databaseName)) {
    throw new TypeError("The database name must be explicitly marked staging, stage, test, or preview.");
  }
  const mediaBucket = config.mediaBucket;
  if (typeof mediaBucket !== "string" ||
      !/(^|[-_])(staging|stage|test|preview)([-_]|$)/i.test(mediaBucket)) {
    throw new TypeError("A separate staging media bucket is required; production buckets are not accepted.");
  }
  if (typeof config.jwtSecret !== "string" || config.jwtSecret.length < 32) {
    throw new TypeError("A staging-only JWT secret of at least 32 characters is required.");
  }
  if (!config.storageClient || typeof config.storageClient.from !== "function") {
    throw new TypeError("An isolated staging Supabase Storage client is required.");
  }
  return Object.freeze({ databaseName, mediaBucket });
}

/**
 * Creates an un-listened HTTP + Socket.IO staging runtime.
 * Dependencies are injected; this function never reads process.env, starts a
 * listener, migrates a database, or changes the active SQLite server.
 */
function createPostgresStagingRuntime({
  config,
  Pool,
  bcrypt,
  jwt,
  express: expressImpl = require("express"),
  createHttpServer = require("node:http").createServer,
  createApiRouter = require("./postgres-api-router").createPostgresApiRouter,
  createRealtimeServer = require("./postgres-realtime-server").createPostgresRealtimeServer,
  apiOptions = {},
  socketOptions = {}
} = {}) {
  const validated = validatePostgresStagingConfig(config);
  if (typeof Pool !== "function") throw new TypeError("A PostgreSQL Pool constructor must be injected.");
  if (!expressImpl || typeof expressImpl !== "function") throw new TypeError("Express must be provided.");
  if (typeof createHttpServer !== "function" ||
      typeof createApiRouter !== "function" ||
      typeof createRealtimeServer !== "function") {
    throw new TypeError("HTTP, API-router, and realtime factories are required.");
  }

  if (typeof expressImpl.json !== "function") {
    throw new TypeError("Express JSON middleware is required for the staging API.");
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ...(config.poolOptions || {})
  });
  let realtime;
  let closed = false;
  try {
    const db = createPostgresAdapter(pool);
    const runtime = createPostgresRuntimeServices({
      db, bcrypt, jwt, jwtSecret: config.jwtSecret,
      storageClient: config.storageClient,
      mediaBucket: validated.mediaBucket
    });
    const app = expressImpl();
    app.disable?.("x-powered-by");
    app.use(expressImpl.json({ limit: "1mb" }));
    app.get("/health/live", (_req, res) => res.status(200).json({
      status: "ok", environment: "staging"
    }));
    app.get("/health/ready", async (_req, res) => {
      try {
        await db.query("SELECT 1");
        return res.status(200).json({ status: "ready", environment: "staging" });
      } catch {
        return res.status(503).json({ status: "not_ready", environment: "staging" });
      }
    });
    const httpServer = createHttpServer(app);
    realtime = createRealtimeServer(httpServer, {
      jwt, jwtSecret: config.jwtSecret,
      realtimeService: runtime.services.realtime,
      socketOptions,
      createSocketAdapter: config.createSocketAdapter,
      adapterPool: config.createSocketAdapter ? pool : undefined,
      adapterOptions: config.socketAdapterOptions || {}
    });
    app.set("io", realtime.io);
    const router = createApiRouter({
      ...apiOptions,
      services: runtime.services,
      mediaStorage: runtime.mediaStorage,
      db, jwt, jwtSecret: config.jwtSecret,
      io: realtime.io,
      getOnlineUserIds: realtime.getOnlineUserIds
    });
    app.use("/api", router);

    async function close() {
      if (closed) return;
      closed = true;
      try {
        if (realtime && typeof realtime.close === "function") await realtime.close();
      } finally {
        if (typeof pool.end === "function") await pool.end();
      }
    }
    return Object.freeze({
      app, httpServer, pool, db, services: runtime.services,
      mediaStorage: runtime.mediaStorage, realtime,
      environment: "staging", close
    });
  } catch (error) {
    if (realtime && typeof realtime.close === "function") {
      Promise.resolve(realtime.close()).catch(() => {});
    }
    if (typeof pool.end === "function") Promise.resolve(pool.end()).catch(() => {});
    throw error;
  }
}

module.exports = { validatePostgresStagingConfig, createPostgresStagingRuntime };
