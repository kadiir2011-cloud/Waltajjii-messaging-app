"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const enabled = process.env.MYSQL_TESTS === "1";
const localHost = ["127.0.0.1", "localhost", "::1"].includes(process.env.MYSQL_HOST || "");
const isolatedDatabase = process.env.MYSQL_DATABASE === "waltajjii_migration_test";

test("real MySQL 8.0.36 adapter smoke test (local isolated database only)", {
  skip: !enabled ? "Set MYSQL_TESTS=1 to enable the local integration test." :
    (!localHost || !isolatedDatabase ? "Safety guard: MYSQL_HOST must be local and MYSQL_DATABASE must be waltajjii_migration_test." : false)
}, async () => {
  const mysql = require("mysql2/promise");
  const { createMySqlAdapter } = require("../src/db-mysql");
  const db = createMySqlAdapter({ mysql });
  const table = "__waltajjii_adapter_it_" + process.pid + "_" + Date.now();
  const q = String.fromCharCode(96) + table + String.fromCharCode(96);

  try {
    const health = await db.ping();
    assert.equal(Number(health.ok), 1);
    assert.match(String(health.serverVersion), /^8\.0\.36(?:[-+ ].*)?$/);
    assert.equal(health.sessionTimeZone, "+00:00");

    await db.execute("CREATE TABLE " + q +
      " (id BIGINT UNSIGNED NOT NULL PRIMARY KEY, label VARCHAR(80) NOT NULL UNIQUE) ENGINE=InnoDB");
    await db.execute("INSERT INTO " + q + " (id, label) VALUES (?, ?)",
      ["9007199254740993", "bigint-roundtrip"]);

    const found = await db.query("SELECT id, label FROM " + q + " WHERE id = ?",
      ["9007199254740993"]);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, "9007199254740993");
    assert.equal(found[0].label, "bigint-roundtrip");

    await assert.rejects(
      db.execute("INSERT INTO " + q + " (id, label) VALUES (?, ?)",
        ["9007199254740994", "bigint-roundtrip"]),
      (error) => db.isDuplicateEntry(error)
    );

    await assert.rejects(
      db.withTransaction(async (tx) => {
        await tx.execute("INSERT INTO " + q + " (id, label) VALUES (?, ?)",
          ["9007199254740995", "rollback-row"]);
        throw new Error("intentional transaction rollback");
      }),
      /intentional transaction rollback/
    );

    const rolledBack = await db.query("SELECT COUNT(*) AS count FROM " + q + " WHERE label = ?",
      ["rollback-row"]);
    assert.equal(Number(rolledBack[0].count), 0);
  } finally {
    try { await db.execute("DROP TABLE IF EXISTS " + q); }
    finally { await db.close(); }
  }
});
