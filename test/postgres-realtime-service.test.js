"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresRealtimeService } = require("../src/services/postgres-realtime-service");
function makeDb(overrides = {}) {
  const calls = [];
  return {
    calls,
    async many(sql, params) { calls.push({ method: "many", sql, params }); return overrides.many ? overrides.many(sql, params) : []; },
    async one(sql, params) { calls.push({ method: "one", sql, params }); return overrides.one ? overrides.one(sql, params) : null; },
    async execute(sql, params) { calls.push({ method: "execute", sql, params }); return overrides.execute ? overrides.execute(sql, params) : { rowCount: 0 }; }
  };
}
test("online profiles exclude viewer and deduplicate IDs", async () => {
  const db = makeDb({ many: async () => [{ userId: "2" }] });
  const svc = createPostgresRealtimeService({ db });
  assert.equal((await svc.getOnlineProfiles(["1", "2", "2", "3"], "1")).length, 1);
  assert.deepEqual(db.calls[0].params, [["2", "3"]]);
  assert.match(db.calls[0].sql, /ANY\(\$1::bigint\[\]\)/);
});
test("online profiles skip query when only viewer is online", async () => {
  const db = makeDb(); const svc = createPostgresRealtimeService({ db });
  assert.deepEqual(await svc.getOnlineProfiles(["9", "9"], "9"), []);
  assert.equal(db.calls.length, 0);
});
test("loads group IDs asynchronously", async () => {
  const db = makeDb({ many: async () => [{ groupId: "5" }, { groupId: "8" }] });
  const svc = createPostgresRealtimeService({ db });
  assert.deepEqual(await svc.listGroupIdsForUser("42"), ["5", "8"]);
  assert.deepEqual(db.calls[0].params, ["42"]);
});
test("checks group membership from PostgreSQL", async () => {
  const svc = createPostgresRealtimeService({ db: makeDb({ one: async () => ({ member: 1 }) }) });
  assert.equal(await svc.isGroupMember("5", "42"), true);
  const absent = createPostgresRealtimeService({ db: makeDb() });
  assert.equal(await absent.isGroupMember("5", "42"), false);
});
test("persists recipient delivery before returning receipt details", async () => {
  const receipt = { messageId: "12", senderId: "3", receiverId: "4", readAt: null };
  const db = makeDb({ one: async sql => /UPDATE messages/.test(sql) ? { id: "12" } : receipt });
  const svc = createPostgresRealtimeService({ db });
  assert.deepEqual(await svc.markMessageDelivered("12", "4"), receipt);
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[0].sql, /receiver_id = \$2/);
  assert.match(db.calls[0].sql, /RETURNING id/);
  assert.deepEqual(db.calls[0].params, ["12", "4"]);
});
test("does not return receipt for a message not owned by recipient", async () => {
  const db = makeDb(); const svc = createPostgresRealtimeService({ db });
  assert.equal(await svc.markMessageDelivered("12", "999"), null);
  assert.equal(db.calls.length, 1);
});
test("database errors propagate for caller error handling", async () => {
  const svc = createPostgresRealtimeService({ db: makeDb({ many: async () => { throw Error("database unavailable"); } }) });
  await assert.rejects(svc.listGroupIdsForUser("42"), /database unavailable/);
});
test("requires PostgreSQL adapter", () => {
  assert.throws(() => createPostgresRealtimeService({ db: {} }), /PostgreSQL adapter/);
});
