"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMySqlAdapter, normalizeInsertId, isDuplicateEntry } = require("../src/db-mysql");

const validEnv = {
  MYSQL_HOST: "127.0.0.1",
  MYSQL_DATABASE: "waltajjii_migration_test",
  MYSQL_USER: "waltajjii_test",
  MYSQL_PASSWORD: "local-test-only",
  MYSQL_PORT: "3307",
  MYSQL_POOL_SIZE: "4"
};

function fakeMysql() {
  const calls = [];
  const connections = [];
  const connection = {
    async query(sql, values) {
      calls.push(["query", sql, values]);
      return [[{ ok: 1, serverVersion: "8.0.36", sessionTimeZone: "+00:00" }], []];
    },
    async execute(sql, values) {
      calls.push(["execute", sql, values]);
      return [{ affectedRows: 1, insertId: "9007199254740993" }, []];
    },
    async beginTransaction() { calls.push(["begin"]); },
    async commit() { calls.push(["commit"]); },
    async rollback() { calls.push(["rollback"]); },
    release() { calls.push(["release"]); }
  };
  const pool = {
    async getConnection() {
      if (!connections.length) connections.push(connection);
      return connection;
    },
    async end() { calls.push(["end"]); }
  };
  return {
    calls,
    connections,
    driver: { createPool(options) { calls.push(["createPool", options]); return pool; } }
  };
}

test("rejects incomplete and invalid MySQL configuration", () => {
  const fake = fakeMysql();
  assert.throws(
    () => createMySqlAdapter({ mysql: fake.driver, env: {} }),
    (error) => error.code === "MYSQL_CONFIGURATION_MISSING"
  );
  assert.throws(
    () => createMySqlAdapter({ mysql: fake.driver, env: { ...validEnv, MYSQL_PORT: "70000" } }),
    /MYSQL_PORT/
  );
  assert.throws(
    () => createMySqlAdapter({ mysql: fake.driver, env: { ...validEnv, MYSQL_POOL_SIZE: "0" } }),
    /MYSQL_POOL_SIZE/
  );
  assert.throws(
    () => createMySqlAdapter({ mysql: fake.driver, env: { ...validEnv, MYSQL_SSL: "sometimes" } }),
    /MYSQL_SSL/
  );
});

test("configures UTF-8, UTC conversion, string BIGINTs and disables multi-statements", async () => {
  const fake = fakeMysql();
  const adapter = createMySqlAdapter({ mysql: fake.driver, env: validEnv });
  const options = fake.calls.find((entry) => entry[0] === "createPool")[1];

  assert.equal(options.charset, "utf8mb4");
  assert.equal(options.timezone, "Z");
  assert.equal(options.dateStrings, true);
  assert.equal(options.supportBigNumbers, true);
  assert.equal(options.bigNumberStrings, true);
  assert.equal(options.multipleStatements, false);
  await adapter.close();
});

test("sets UTC once per pooled connection before application SQL", async () => {
  const fake = fakeMysql();
  const adapter = createMySqlAdapter({ mysql: fake.driver, env: validEnv });

  const health = await adapter.ping();
  assert.equal(health.sessionTimeZone, "+00:00");
  await adapter.execute("UPDATE sample SET value = ?", ["x"]);

  const statements = fake.calls.filter((entry) => entry[0] === "query" || entry[0] === "execute");
  assert.equal(statements[0][1], "SET time_zone = '+00:00'");
  assert.match(statements[1][1], /SELECT 1 AS ok/);
  assert.match(statements[2][1], /UPDATE sample/);
  assert.equal(fake.calls.filter((entry) => entry[0] === "query" && entry[1] === "SET time_zone = '+00:00'").length, 1);
  assert.equal(fake.calls.filter((entry) => entry[0] === "release").length, 2);
});

test("pins transaction queries to one UTC-initialized connection and commits", async () => {
  const fake = fakeMysql();
  const adapter = createMySqlAdapter({ mysql: fake.driver, env: validEnv });

  const result = await adapter.withTransaction(async (tx) => {
    await tx.execute("INSERT INTO sample(value) VALUES (?)", ["one"]);
    await tx.query("SELECT value FROM sample WHERE value = ?", ["one"]);
    return "committed";
  });

  assert.equal(result, "committed");
  assert.equal(fake.connections.length, 1);
  assert.deepEqual(
    fake.calls.filter((entry) => ["begin", "commit", "rollback", "release"].includes(entry[0]))
      .map((entry) => entry[0]),
    ["begin", "commit", "release"]
  );
  assert.equal(fake.calls.filter((entry) => entry[0] === "query" && entry[1] === "SET time_zone = '+00:00'").length, 1);
});

test("rolls back failed transactions and always releases the connection", async () => {
  const fake = fakeMysql();
  const adapter = createMySqlAdapter({ mysql: fake.driver, env: validEnv });

  await assert.rejects(
    adapter.withTransaction(async () => { throw new Error("expected test failure"); }),
    /expected test failure/
  );

  assert.deepEqual(
    fake.calls.filter((entry) => ["begin", "commit", "rollback", "release"].includes(entry[0]))
      .map((entry) => entry[0]),
    ["begin", "rollback", "release"]
  );
});

test("preserves BIGINT insert IDs as exact decimal strings", () => {
  assert.equal(normalizeInsertId(42), "42");
  assert.equal(normalizeInsertId(42n), "42");
  assert.equal(normalizeInsertId("9007199254740993"), "9007199254740993");
  assert.throws(() => normalizeInsertId(Number.MAX_SAFE_INTEGER + 1), /insertId/);
  assert.throws(() => normalizeInsertId(-1), /insertId/);
});

test("classifies only MySQL duplicate-key errors as duplicates", () => {
  assert.equal(isDuplicateEntry({ code: "ER_DUP_ENTRY", errno: 1062 }), true);
  assert.equal(isDuplicateEntry({ code: "ER_NO_REFERENCED_ROW_2", errno: 1452 }), false);
  assert.equal(isDuplicateEntry({ code: "ER_DATA_TOO_LONG", errno: 1406 }), false);
  assert.equal(isDuplicateEntry(null), false);
});

test("exposes ping and closes the pool", async () => {
  const fake = fakeMysql();
  const adapter = createMySqlAdapter({ mysql: fake.driver, env: validEnv });

  const result = await adapter.ping();
  assert.equal(result.ok, 1);
  await adapter.close();
  assert.equal(fake.calls.at(-1)[0], "end");
});
