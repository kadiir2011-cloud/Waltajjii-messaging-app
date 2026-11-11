"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { createPostgresAdapter } = require("../src/db/postgres-adapter");
const { createPostgresMediaStorageService } = require("../src/services/postgres-media-storage-service");

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL.");
const pool = new Pool({ connectionString, max: 5, options: "-c search_path=waltajjii,public" });
const db = createPostgresAdapter(pool);
const objects = new Map();
let service, user;
const fakeStorage = {
  from(bucket) {
    assert.equal(bucket, "waltajjii-media");
    return {
      async upload(key, buffer, options) {
        if (objects.has(key)) return { error: new Error("already exists") };
        objects.set(key, { buffer: Buffer.from(buffer), contentType: options.contentType });
        return { data: { path: key }, error: null };
      },
      async download(key) {
        const item = objects.get(key);
        return item ? { data: { arrayBuffer: async () => item.buffer }, error: null } : { data: null, error: new Error("not found") };
      },
      async remove(keys) {
        keys.forEach(key => objects.delete(key));
        return { data: keys, error: null };
      }
    };
  }
};

test("Phase 54: private media metadata, ownership, size/type validation and rollback", async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, "..", "migrations/postgres/001_initial_schema.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(__dirname, "..", "migrations/postgres/003_media_objects.sql"), "utf8"));
  const username = "p54_media_" + Date.now();
  user = await db.one("INSERT INTO users(username,password_hash) VALUES($1,'hash') RETURNING id", [username]);
  service = createPostgresMediaStorageService({ db, storageClient: fakeStorage, idFactory: () => "11111111-1111-4111-8111-111111111111" });

  const file = { mimetype: "image/png", buffer: Buffer.from("png-test-bytes") };
  const uploaded = await service.upload(String(user.id), file, "profile");
  assert.equal(uploaded.ownerId, String(user.id));
  assert.equal(uploaded.bucket, "waltajjii-media");
  assert.match(uploaded.objectKey, new RegExp("^" + user.id + "/[0-9a-f-]+\\.png$"));
  assert.equal(objects.has(uploaded.objectKey), true);

  const read = await service.downloadOwned(String(user.id), String(uploaded.id));
  assert.deepEqual(read.buffer, file.buffer);
  assert.equal(read.metadata.mimeType, "image/png");
  await assert.rejects(service.getOwned(String(Number(user.id) + 999999), String(uploaded.id)), { status: 404 });
  await assert.rejects(service.upload(String(user.id), { ...file, mimetype: "application/x-msdownload" }, "message"), { status: 415 });
  await assert.rejects(service.upload(String(user.id), { mimetype: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }, "profile"), { status: 413 });
  await assert.rejects(service.upload(String(user.id), file, "unknown"), { status: 400 });

  const removed = await service.removeOwned(String(user.id), String(uploaded.id));
  assert.equal(removed.removed, true);
  assert.equal(objects.has(uploaded.objectKey), false);
  await assert.rejects(service.getOwned(String(user.id), String(uploaded.id)), { status: 404 });
});

test.after(async () => {
  if (user) await pool.query("DELETE FROM users WHERE id=$1", [String(user.id)]);
  await pool.end();
});
