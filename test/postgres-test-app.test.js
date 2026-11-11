"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createPostgresTestApp } = require("../src/postgres/test-app");

const secret = "phase36-test-secret-with-more-than-32-characters";
const jwt = {
  verify(token, suppliedSecret, options) {
    assert.equal(suppliedSecret, secret);
    assert.equal(options.issuer, "waltajjii");
    assert.equal(options.audience, "waltajjii-users");
    if (token !== "valid-token") throw new Error("invalid token");
    return { userId: "10", username: "viewer" };
  }
};

async function withApp(overrides, callback) {
  const app = createPostgresTestApp({
    jwt, jwtSecret: secret,
    authLimiter: (req, res, next) => next(),
    authService: {
      async register() { return { message: "Account created successfully." }; },
      async login() { return { message: "Login successful.", token: "token" }; },
      async getProfile() { return { user: { id: "10" } }; },
      async updateProfile() { return { message: "Profile updated successfully." }; }
    },
    realtimeService: { async getOnlineProfiles(ids, viewerId) {
      return [{ userId: "11", fullName: "Online member" }];
    }},
    ...overrides
  });
  app.set("onlineUserIds", ["10", "11"]);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await callback("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("test app exposes a health endpoint without opening a database connection", async () => {
  await withApp({}, async base => {
    const response = await fetch(base + "/health");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  });
});

test("presence endpoint rejects requests without a bearer token", async () => {
  await withApp({}, async base => {
    const response = await fetch(base + "/api/presence/online");
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "Login required.");
  });
});

test("presence endpoint rejects invalid tokens", async () => {
  await withApp({}, async base => {
    const response = await fetch(base + "/api/presence/online", {
      headers: { authorization: "Bearer invalid-token" }
    });
    assert.equal(response.status, 401);
  });
});

test("presence endpoint returns limited profiles and disables caching", async () => {
  let received;
  await withApp({
    realtimeService: { async getOnlineProfiles(ids, viewerId) {
      received = { ids, viewerId };
      return [{ userId: "11", fullName: "Online member", avatarPath: null }];
    }}
  }, async base => {
    const response = await fetch(base + "/api/presence/online", {
      headers: { authorization: "Bearer valid-token" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      users: [{ userId: "11", fullName: "Online member", avatarPath: null }]
    });
    assert.deepEqual(received, { ids: ["10", "11"], viewerId: "10" });
  });
});

test("presence endpoint returns safe error on persistence failure", async () => {
  await withApp({
    realtimeService: { async getOnlineProfiles() {
      throw new Error("postgres://private-credentials@host/db");
    }}
  }, async base => {
    const response = await fetch(base + "/api/presence/online", {
      headers: { authorization: "Bearer valid-token" }
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Could not retrieve online members." });
  });
});

test("factory requires injected services and does not create its own dependencies", () => {
  assert.throws(() => createPostgresTestApp({}), /complete PostgreSQL authentication service|required/);
});
