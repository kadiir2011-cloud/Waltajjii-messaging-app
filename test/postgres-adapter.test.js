"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresAdapter } = require("../src/db/postgres-adapter");

function makePool() {
  const calls = [];
  let released = 0;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "SELECT value") return { rows: [{ value: 7 }], rowCount: 1 };
      return { rows: [], rowCount: 2 };
    },
    release() { released += 1; }
  };
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "SELECT value") return { rows: [{ value: 7 }], rowCount: 1 };
      return { rows: [], rowCount: 2 };
    },
    async connect() { return client; }
  };
  return { pool, calls, released: () => released };
}

test("requires a pool-compatible object", () => {
  assert.throws(() => createPostgresAdapter(null), /Pool/);
});

test("query helpers preserve parameterized values and result shapes", async () => {
  const mock = makePool();
  const db = createPostgresAdapter(mock.pool);
  assert.equal((await db.one("SELECT value")).value, 7);
  assert.deepEqual(await db.many("SELECT items"), []);
  assert.equal(await db.execute("UPDATE items SET value = $1", [7]), 2);
  assert.deepEqual(mock.calls[2].params, [7]);
});

test("commits successful transactions and always releases the client", async () => {
  const mock = makePool();
  const db = createPostgresAdapter(mock.pool);
  const value = await db.withTransaction(async tx => {
    await tx.execute("UPDATE items SET value = $1", [9]);
    return "ok";
  });
  assert.equal(value, "ok");
  assert.deepEqual(mock.calls.map(call => call.sql), ["BEGIN", "UPDATE items SET value = $1", "COMMIT"]);
  assert.equal(mock.released(), 1);
});

test("rolls back failed transactions and rethrows the original error", async () => {
  const mock = makePool();
  const db = createPostgresAdapter(mock.pool);
  const expected = new Error("intentional test failure");
  await assert.rejects(db.withTransaction(async () => { throw expected; }), error => error === expected);
  assert.deepEqual(mock.calls.map(call => call.sql), ["BEGIN", "ROLLBACK"]);
  assert.equal(mock.released(), 1);
});
