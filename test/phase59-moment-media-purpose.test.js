"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresMediaStorageService } = require("../src/services/postgres-media-storage-service");

function fixture({ row = { id: "91", ownerId: "7", bucket: "waltajjii-media", objectKey: "7/moment.png", purpose: "moment", mimeType: "image/png", fileSize: 4 } } = {}) {
  const queries = [], removed = [], downloaded = [];
  const db = {
    one: async (sql, params) => { queries.push({ sql, params }); return row; },
    execute: async (sql, params) => { queries.push({ sql, params }); return 1; }
  };
  const storageClient = { from: bucket => ({
    remove: async keys => { removed.push({ bucket, keys }); return { error: null }; },
    download: async key => { downloaded.push({ bucket, key }); return { data: { arrayBuffer: async () => Uint8Array.from([1,2,3,4]).buffer }, error: null }; },
    upload: async () => ({ error: null })
  }) };
  return { service: createPostgresMediaStorageService({ db, storageClient }), queries, removed, downloaded };
}

test("Moment media download is constrained to the Moment purpose", async () => {
  const f = fixture();
  const result = await f.service.downloadOwned("7", "91", "moment");
  assert.equal(result.metadata.purpose, "moment");
  assert.deepEqual([...result.buffer], [1,2,3,4]);
  assert.deepEqual(f.queries[0].params, ["91", "7", "moment"]);
  assert.match(f.queries[0].sql, /purpose=\$3/);
});

test("Moment media removal is constrained to the Moment purpose", async () => {
  const f = fixture();
  const result = await f.service.removeOwned("7", "91", "moment");
  assert.deepEqual(result, { id: "91", removed: true });
  assert.deepEqual(f.queries[0].params, ["91", "7", "moment"]);
  assert.deepEqual(f.removed, [{ bucket: "waltajjii-media", keys: ["7/moment.png"] }]);
  assert.deepEqual(f.queries[1].params, ["91", "7", "moment"]);
  assert.match(f.queries[1].sql, /purpose=\$3/);
});

test("Moment media reads fail closed when the media object is absent", async () => {
  const f = fixture({ row: null });
  await assert.rejects(f.service.downloadOwned("7", "91", "moment"), error => error.status === 404);
  assert.equal(f.downloaded.length, 0);
});
