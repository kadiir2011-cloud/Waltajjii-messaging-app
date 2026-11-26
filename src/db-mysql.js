"use strict";

// Isolated MySQL 8 adapter for migration work.
// This module is intentionally NOT imported by src/server.js.
// BIGINT values are returned as strings to avoid JavaScript precision loss.

function requiredConfig(env) {
  const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
  const missing = required.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length) {
    const error = new Error("MySQL configuration is incomplete: " + missing.join(", "));
    error.code = "MYSQL_CONFIGURATION_MISSING";
    throw error;
  }

  const port = Number(env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port.");
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

function normalizeInsertId(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  throw new TypeError("MySQL insertId is not a valid non-negative integer.");
}

function isDuplicateEntry(error) {
  return Boolean(error && error.code === "ER_DUP_ENTRY" && error.errno === 1062);
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

  // timezone:"Z" controls driver conversion only. Set the server session timezone
  // on every physical pooled connection before application statements use it.
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

  async function queryOn(connection, sql, values = []) {
    const [rows] = await connection.execute(sql, values);
    return rows;
  }

  async function executeOn(connection, sql, values = []) {
    const [result] = await connection.execute(sql, values);
    return result;
  }

  async function query(sql, values = []) {
    const connection = await acquireConnection();
    try {
      return await queryOn(connection, sql, values);
    } finally {
      connection.release();
    }
  }

  async function execute(sql, values = []) {
    const connection = await acquireConnection();
    try {
      return await executeOn(connection, sql, values);
    } finally {
      connection.release();
    }
  }

  async function ping() {
    const rows = await query(
      "SELECT 1 AS ok, VERSION() AS serverVersion, @@session.time_zone AS sessionTimeZone"
    );
    return rows[0];
  }

  async function withTransaction(work) {
    if (typeof work !== "function") {
      throw new TypeError("withTransaction requires an async callback.");
    }

    const connection = await acquireConnection();
    const tx = {
      query: (sql, values = []) => queryOn(connection, sql, values),
      execute: (sql, values = []) => executeOn(connection, sql, values)
    };
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const result = await work(tx);
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

  return { query, execute, ping, withTransaction, close, normalizeInsertId, isDuplicateEntry };
}

module.exports = { createMySqlAdapter, normalizeInsertId, isDuplicateEntry };
