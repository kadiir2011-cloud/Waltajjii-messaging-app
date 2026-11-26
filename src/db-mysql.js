"use strict";

// Isolated MySQL 8 adapter for migration work.
// This module is intentionally NOT imported by src/server.js.
// BIGINT values are returned as strings to avoid JavaScript precision loss.

function requiredConfig(env) {
  const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
  const missing = required.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length) {
    const error = new Error(`MySQL configuration is incomplete: ${missing.join(", ")}`);
    error.code = "MYSQL_CONFIGURATION_MISSING";
    throw error;
  }

  const port = Number(env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be an integer between 1 and 65535.");
  }

  const connectionLimit = Number(env.MYSQL_POOL_SIZE || 5);
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 50) {
    throw new Error("MYSQL_POOL_SIZE must be an integer between 1 and 50.");
  }

  if (env.MYSQL_SSL != null && !["true", "false"].includes(String(env.MYSQL_SSL).toLowerCase())) {
    throw new Error("MYSQL_SSL must be 'true' or 'false'.");
  }

  return { port, connectionLimit };
}

function createMySqlAdapter({ mysql, env = process.env }) {
  if (!mysql || typeof mysql.createPool !== "function") {
    throw new TypeError("createMySqlAdapter requires the mysql2/promise module.");
  }

  const { port, connectionLimit } = requiredConfig(env);
  const pool = mysql.createPool({
    host: env.MYSQL_HOST,
    port,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(String(env.MYSQL_SSL).toLowerCase() === "true"
      ? { ssl: { rejectUnauthorized: true } }
      : {})
  });

  // A pooled connection is initialized exactly once before any application SQL
  // is run on it. This is stronger than relying on the driver's timezone option,
  // which controls JS conversion but does not set the server session timezone.
  const utcInitialized = new WeakSet();

  async function acquireConnection() {
    const connection = await pool.getConnection();
    try {
      if (!utcInitialized.has(connection)) {
        await connection.query("SET time_zone = '+00:00'");
        utcInitialized.add(connection);
      }
      return connection;
    } catch (error) {
      connection.release();
      throw error;
    }
  }

  async function runOnConnection(method, sql, values = []) {
    const connection = await acquireConnection();
    try {
      return await connection[method](sql, values);
    } finally {
      connection.release();
    }
  }

  async function query(sql, values = []) {
    return runOnConnection("query", sql, values);
  }

  async function execute(sql, values = []) {
    return runOnConnection("execute", sql, values);
  }

  async function ping() {
    const [rows] = await query("SELECT 1 AS ok, VERSION() AS serverVersion");
    return rows[0];
  }

  async function withTransaction(work) {
    if (typeof work !== "function") {
      throw new TypeError("withTransaction requires an async callback.");
    }

    const connection = await acquireConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const result = await work(connection);
      await connection.commit();
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          if (error && typeof error === "object") error.rollbackError = rollbackError;
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async function close() {
    await pool.end();
  }

  return { query, execute, ping, withTransaction, close };
}

// Runtime singleton. Tests use createMySqlAdapter with a fake pool and do not
// require a running MySQL server or the mysql2 package to be installed.
const adapter = createMySqlAdapter({
  mysql: require("mysql2/promise"),
  env: process.env
});

module.exports = { ...adapter, createMySqlAdapter };
