"use strict";

// Isolated MySQL 8 pool for the migration branch.
// This module is intentionally NOT imported by src/server.js yet.
const mysql = require("mysql2/promise");

const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

if (missing.length) {
  const error = new Error(`MySQL configuration is incomplete: ${missing.join(", ")}`);
  error.code = "MYSQL_CONFIGURATION_MISSING";
  throw error;
}

const port = Number(process.env.MYSQL_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("MYSQL_PORT must be a valid TCP port.");
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port,
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 5),
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "Z",
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  multipleStatements: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ...(process.env.MYSQL_SSL === "true"
    ? { ssl: { rejectUnauthorized: true } }
    : {})
});

async function ping() {
  const [rows] = await pool.query("SELECT 1 AS ok, VERSION() AS serverVersion");
  return rows[0];
}

async function withTransaction(work) {
  if (typeof work !== "function") {
    throw new TypeError("withTransaction requires an async callback.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, ping, withTransaction, close };
