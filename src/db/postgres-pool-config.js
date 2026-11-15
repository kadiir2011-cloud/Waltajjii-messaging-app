"use strict";

/**
 * Builds a safe, server-side node-postgres Pool configuration.
 * This module does not create a connection or read credentials from files.
 */
function buildPostgresPoolConfig(env = process.env) {
  const connectionString = env.DATABASE_URL;
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new Error("DATABASE_URL is required before PostgreSQL can be enabled.");
  }
  let parsed;
  try { parsed = new URL(connectionString); }
  catch { throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL."); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
  }
  if (!parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname || parsed.pathname === "/") {
    throw new Error("DATABASE_URL must include a host, database, username, and password.");
  }
  const max = Number(env.PG_POOL_MAX || 2);
  if (!Number.isInteger(max) || max < 1 || max > 5) {
    throw new Error("PG_POOL_MAX must be an integer between 1 and 5 for this deployment.");
  }
  return Object.freeze({
    connectionString, max, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    application_name: "waltajjii",
    ssl: { rejectUnauthorized: true },
    options: "-c search_path=waltajjii,public"
  });
}
function createPostgresPool(Pool, env = process.env) {
  if (typeof Pool !== "function") throw new TypeError("A node-postgres Pool constructor is required.");
  return new Pool(buildPostgresPoolConfig(env));
}
module.exports = { buildPostgresPoolConfig, createPostgresPool };
