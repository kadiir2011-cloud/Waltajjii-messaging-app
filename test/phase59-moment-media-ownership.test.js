"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresMomentsService } = require("../src/services/postgres-moments-service");

function makeDb({ mediaRow } = {}) {
  const calls = [];
  let transactions = 0;
  let rollbacks = 0;
  const tx = {
    one: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM media_objects")) return mediaRow || null;
      if (sql.includes("INSERT INTO moments")) return {
        id: "501", userId: String(params[0]), content: params[1],
        mediaPath: params[2], mediaType: params[3], audience: params[4],
        createdAt: "2026-11-11T00:00:00.000Z", expiresAt: "2026-11-12T00:00:00.000Z"
      };
      if (sql.includes("SELECT username")) return { username: "owner", fullName: "Owner", avatarPath: null };
      throw new Error("Unexpected query: " + sql);
    },
    many: async () => [],
    execute: async () => 1
  };
  return {
    calls,
    get transactions() { return transactions; },
    get rollbacks() { return rollbacks; },
    one: (...args) => tx.one(...args),
    many: (...args) => tx.many(...args),
    execute: (...args) => tx.execute(...args),
    withTransaction: async work => {
      transactions += 1;
      try { return await work(tx); }
      catch (error) { rollbacks += 1; throw error; }
    }
  };
}

test("Moment creation rejects another user's media and never inserts the Moment", async () => {
  const db = makeDb({ mediaRow: null });
  const service = createPostgresMomentsService({ db });
  await assert.rejects(
    service.create("101", { content: "private image", mediaPath: "9001", mediaType: "image" }),
    error => error.status === 400 && /does not belong/.test(error.message)
  );
  assert.equal(db.transactions, 1);
  assert.equal(db.rollbacks, 1);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /owner_id=\$2/);
  assert.match(db.calls[0].sql, /purpose='moment'/);
  assert.match(db.calls[0].sql, /FOR UPDATE/);
  assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO moments")), false);
});

test("Moment ownership lock, insert and owner lookup share one transaction", async () => {
  const db = makeDb({ mediaRow: { id: "9001" } });
  const service = createPostgresMomentsService({ db });
  const result = await service.create("101", {
    content: "my image", mediaPath: "9001", mediaType: "image", audience: "followers"
  });
  assert.equal(result.moment.mediaPath, "9001");
  assert.equal(db.transactions, 1);
  assert.equal(db.rollbacks, 0);
  assert.equal(db.calls.length, 3);
  assert.deepEqual(db.calls[0].params, ["9001", "101"]);
  assert.match(db.calls[0].sql, /deleted_at IS NULL/);
  assert.ok(db.calls[1].sql.includes("INSERT INTO moments"));
  assert.ok(db.calls[2].sql.includes("SELECT username"));
});

test("Text-only Moment creation also uses the transaction boundary", async () => {
  const db = makeDb();
  const service = createPostgresMomentsService({ db });
  const result = await service.create("101", { content: "hello" });
  assert.equal(result.moment.content, "hello");
  assert.equal(db.transactions, 1);
  assert.equal(db.rollbacks, 0);
  assert.equal(db.calls.length, 2);
  assert.ok(db.calls[0].sql.includes("INSERT INTO moments"));
});
