"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { createPostgresUploadsRouter } = require("../src/routes/postgres-uploads");
const { createPostgresCallsRouter } = require("../src/routes/postgres-calls");

const secret = "phase56-media-route-test-secret-with-more-than-32-characters";
const token = jwt.sign({ userId: "101", username: "media-tester" }, secret, { issuer: "waltajjii", audience: "waltajjii-users" });
const testFile = () => ({ fieldname: "media", originalname: "picture.png", encoding: "7bit", mimetype: "image/png", size: 3, buffer: Buffer.from("png") });
const middleware = (field) => (req, res, next) => { req.file = testFile(); next(); };

async function listen(app, t) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return "http://127.0.0.1:" + server.address().port;
}

test("PostgreSQL uploads preserve frontend upload response and authorize media retrieval", async t => {
  const calls = [];
  const mediaStorage = {
    upload: async (...args) => { calls.push(["upload", ...args]); return { id: "777" }; },
    removeOwned: async (...args) => { calls.push(["remove", ...args]); return { removed: true }; },
    downloadOwned: async (...args) => ({ metadata: { mimeType: "image/png" }, buffer: Buffer.from("avatar") }),
    downloadForViewer: async (...args) => { calls.push(["downloadForViewer", ...args]); return { metadata: { mimeType: "image/png" }, buffer: Buffer.from("media") }; }
  };
  const db = {
    one: async sql => sql.startsWith("SELECT avatar_path") ? { avatarPath: null } : { id: "101" },
    execute: async () => 1
  };
  const app = express();
  app.use("/api/uploads", createPostgresUploadsRouter({
    mediaStorage, db, jwtSecret: secret,
    uploadMiddleware: middleware("media"),
    profileUploadMiddleware: middleware("avatar")
  }));
  const base = await listen(app, t);
  const headers = { Authorization: "Bearer " + token };

  const unauthorized = await fetch(base + "/777");
  assert.equal(unauthorized.status, 401);

  const uploaded = await fetch(base + "/", { method: "POST", headers });
  assert.equal(uploaded.status, 201);
  assert.deepEqual(await uploaded.json(), { message: "File uploaded successfully.", fileId: "777", mediaType: "image" });
  assert.equal(calls[0][1], "101");
  assert.equal(calls[0][3], "message");

  const retrieved = await fetch(base + "/777", { headers });
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.headers.get("content-type"), "image/png");
  assert.equal(await retrieved.text(), "media");
  assert.deepEqual(calls.find(x => x[0] === "downloadForViewer"), ["downloadForViewer", "101", "777"]);

  const avatar = await fetch(base + "/profile-picture", { method: "POST", headers });
  assert.equal(avatar.status, 200);
  assert.equal((await avatar.json()).avatarPath, "777");
});

test("PostgreSQL TURN route keeps provider credentials server-side and returns ICE servers", async t => {
  let requestedUrl = "";
  const app = express();
  app.use("/api/calls", createPostgresCallsRouter({
    jwtSecret: secret,
    apiKey: "private key&value",
    fetchImpl: async url => {
      requestedUrl = url;
      return { ok: true, json: async () => [{ urls: ["turn:example.test"], username: "temporary" }] };
    }
  }));
  const base = await listen(app, t);
  const response = await fetch(base + "/turn-credentials", { headers: { Authorization: "Bearer " + token } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).iceServers, [{ urls: ["turn:example.test"], username: "temporary" }]);
  assert.ok(requestedUrl.includes("apiKey=private%20key%26value"));
});

test("PostgreSQL TURN route fails safely when provider credentials are absent", async t => {
  const app = express();
  app.use("/api/calls", createPostgresCallsRouter({ jwtSecret: secret, apiKey: "" }));
  const base = await listen(app, t);
  const response = await fetch(base + "/turn-credentials", { headers: { Authorization: "Bearer " + token } });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /apiKey|private key/i);
});
