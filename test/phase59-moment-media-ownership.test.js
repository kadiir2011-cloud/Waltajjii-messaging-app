"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresMomentsService } = require("../src/services/postgres-moments-service");

function makeDb({ mediaRow } = {}) {
  const calls = [];
  return {
    calls,
    one: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM media_objects")) return mediaRow || null;
      if (sql.includes("INSERT INTO moments")) return {
        id: "501", userId: String(params[0]), content: params[1],
        mediaPath: params[2], mediaType: params[3], audience: params[4],
        createdAt: "2026-11-11T00:00:00.000Z", expiresAt: "2026-11-11T24:00:00.000Z"
      };
      if (sql.includes("SELECT username")) return { username: "owner", fullName: "Owner", avatarPath: null };
      throw new Error("Unexpected query: " + sql);
    },
    many: async () => [],
    execute: async () => 1,
    withTransaction: async fn => fn(this)
  };
}

test("Moment creation rejects another user's media and never inserts the Moment", async () => {
  const db = makeDb({ mediaRow: null });
  const service = createPostgresMomentsService({ db });
  await assert.rejects(
    service.create("101", { content: "private image", mediaPath: "9001", mediaType: "image" }),
    error => error.status === 400 && /does not belong/.test(error.message)
  );
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /owner_id=\$2/);
  assert.match(db.calls[0].sql, /purpose='moment'/);
  assert.equal(db.calls.some(call => call.sql.includes("INSERT INTO moments")), false);
});

test("Moment creation accepts only active Moment media owned by the creator", async () => {
  const db = makeDb({ mediaRow: { id: "9001" } });
  const service = createPostgresMomentsService({ db });
  const result = await service.create("101", {
    content: "my image", mediaPath: "9001", mediaType: "image", audience: "followers"
  });
  assert.equal(result.moment.mediaPath, "9001");
  assert.equal(db.calls.length, 3);
  assert.deepEqual(db.calls[0].params, ["9001", "101"]);
  assert.match(db.calls[0].sql, /deleted_at IS NULL/);
  assert.ok(db.calls.some(call => call.sql.includes("INSERT INTO moments")));
});
