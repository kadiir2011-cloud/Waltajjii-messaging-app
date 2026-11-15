"use strict";

/**
 * Small, dependency-free PostgreSQL adapter around a node-postgres-compatible
 * Pool. The caller supplies the Pool so this module can be unit-tested without
 * a live database or a driver dependency.
 *
 * This module is deliberately NOT wired into the running app yet. The current
 * application still uses synchronous better-sqlite3 throughout its routes and
 * Socket.IO handlers. Do not switch the runtime until those call sites migrate.
 */
function createPostgresAdapter(pool) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL Pool with query() and connect() is required.");
  }

  async function query(sql, params = []) {
    if (typeof sql !== "string" || !sql.trim()) {
      throw new TypeError("SQL must be a non-empty string.");
    }
    if (!Array.isArray(params)) {
      throw new TypeError("SQL parameters must be supplied as an array.");
    }
    return pool.query(sql, params);
  }

  async function one(sql, params = []) {
    const result = await query(sql, params);
    return result.rows[0] ?? null;
  }

  async function many(sql, params = []) {
    const result = await query(sql, params);
    return result.rows;
  }

  async function execute(sql, params = []) {
    const result = await query(sql, params);
    return result.rowCount ?? 0;
  }

  async function withTransaction(work) {
    if (typeof work !== "function") {
      throw new TypeError("Transaction work must be a function.");
    }

    const client = await pool.connect();
    let began = false;
    try {
      await client.query("BEGIN");
      began = true;
      const result = await work({
        query: async (sql, params = []) => {
          if (typeof sql !== "string" || !sql.trim()) {
            throw new TypeError("SQL must be a non-empty string.");
          }
          if (!Array.isArray(params)) {
            throw new TypeError("SQL parameters must be supplied as an array.");
          }
          return client.query(sql, params);
        },
        one: async (sql, params = []) => {
          const response = await client.query(sql, params);
          return response.rows[0] ?? null;
        },
        many: async (sql, params = []) => {
          const response = await client.query(sql, params);
          return response.rows;
        },
        execute: async (sql, params = []) => {
          const response = await client.query(sql, params);
          return response.rowCount ?? 0;
        }
      });
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          // Preserve the original failure; attach rollback detail for logs.
          error.rollbackError = rollbackError;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({ query, one, many, execute, withTransaction });
}

module.exports = { createPostgresAdapter };
