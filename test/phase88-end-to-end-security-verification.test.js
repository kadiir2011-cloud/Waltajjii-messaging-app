"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createPostgresAuthRouter } = require("../src/routes/postgres-auth");
const { attachPostgresRealtime } = require("../src/postgres/postgres-realtime-socket");
const { createOriginPolicy } = require("../src/security/origin-policy");
const { inspectSessionClaims } = require("../src/security/session-token-policy");

const secret = "phase88-end-to-end-test-secret-with-at-least-32-characters";
const issuer = "waltajjii";
const audience = "waltajjii-users";

function makeToken(overrides = {}, options = {}) {
  return jwt.sign(
    { userId: 7, username: "phase88_user", ...overrides },
    secret,
    { expiresIn: "2h", issuer, audience, ...options }
  );
}

function createSocketAuthHarness() {
  const middlewares = [];
  const io = {
    use(fn) { middlewares.push(fn); },
    on() {}
  };
  attachPostgresRealtime(io, {
    jwt,
    jwtSecret: secret,
    realtimeService: {
      async listGroupIdsForUser() { return []; },
      async isGroupMember() { return false; },
      async markMessageDelivered() { return null; }
    }
  });
  return {
    async authenticate(token) {
      const socket = { handshake: { auth: token ? { token } : {} }, data: {} };
      return new Promise(resolve => middlewares[0](socket, error => resolve({
        error: error || null,
        data: socket.data
      })));
    }
  };
}

async function withAuthServer(run) {
  const issued = makeToken();
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createPostgresAuthRouter({
    jwt,
    jwtSecret: secret,
    limiter: (req, res, next) => next(),
    authService: {
      async register() { return { message: "ok" }; },
      async login() {
        return {
          message: "Login successful.",
          token: issued,
          user: { id: 7, username: "phase88_user" }
        };
      },
      async getProfile(userId) {
        return { user: { id: userId, username: "phase88_user" } };
      },
      async updateProfile(userId) {
        return { user: { id: userId, username: "phase88_user" } };
      }
    }
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run("http://127.0.0.1:" + server.address().port, issued);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("Phase 88: login-issued JWT works across profile HTTP and Socket.IO authentication", async () => {
  const sockets = createSocketAuthHarness();
  await withAuthServer(async (base, expectedToken) => {
    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "phase88_user", password: "test-only" })
    });
    assert.equal(login.status, 200);
    const payload = await login.json();
    assert.equal(payload.token, expectedToken);

    const profile = await fetch(base + "/api/auth/profile", {
      headers: { authorization: "Bearer " + payload.token }
    });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).user.id, 7);

    const socket = await sockets.authenticate(payload.token);
    assert.equal(socket.error, null);
    assert.equal(socket.data.userId, "7");
    assert.equal(socket.data.username, "phase88_user");

    const decoded = jwt.verify(payload.token, secret, { issuer, audience });
    const claims = inspectSessionClaims(decoded);
    assert.equal(claims.valid, true);
    assert.equal(claims.userId, 7);
  });
});

test("Phase 88: missing, tampered, expired, wrong-issuer and wrong-audience tokens fail HTTP and Socket.IO checks", async () => {
  const sockets = createSocketAuthHarness();
  const invalidTokens = [
    null,
    "not-a-jwt",
    makeToken({}, { expiresIn: -1 }),
    makeToken({}, { issuer: "untrusted-issuer" }),
    makeToken({}, { audience: "untrusted-audience" }),
    makeToken({ username: undefined })
  ];
  const tampered = makeToken().split(".");
  tampered[2] = (tampered[2][0] === "a" ? "b" : "a") + tampered[2].slice(1);
  invalidTokens.push(tampered.join("."));

  await withAuthServer(async base => {
    for (const token of invalidTokens) {
      const headers = token ? { authorization: "Bearer " + token } : {};
      const response = await fetch(base + "/api/auth/profile", { headers });
      assert.equal(response.status, 401);
      const socket = await sockets.authenticate(token);
      assert.ok(socket.error, "Socket.IO must reject invalid token: " + String(token).slice(0, 20));
    }
  });
});

test("Phase 88: missing or malformed session identity claims fail the shared claim policy", () => {
  const now = Math.floor(Date.now() / 1000);
  const base = {
    iss: issuer,
    aud: audience,
    userId: 7,
    username: "phase88_user",
    iat: now,
    exp: now + 300
  };
  assert.equal(inspectSessionClaims(base, now).valid, true);
  assert.equal(inspectSessionClaims({ ...base, userId: 0 }, now).valid, false);
  assert.equal(inspectSessionClaims({ ...base, username: "not valid" }, now).valid, false);
  assert.equal(inspectSessionClaims({ ...base, exp: now }, now).reason, "expired-or-missing-expiry");
});

test("Phase 88: configured browser origins are allowed and untrusted cross-origins are rejected", () => {
  const policy = createOriginPolicy({
    NODE_ENV: "production",
    CLIENT_URL: "https://app.waltajjii.example",
    WALTAJJII_ALLOWED_ORIGINS: "https://admin.waltajjii.example"
  });
  assert.equal(policy.isAllowedRequestOrigin("https://app.waltajjii.example", "api.waltajjii.example"), true);
  assert.equal(policy.isAllowedRequestOrigin("https://admin.waltajjii.example", "api.waltajjii.example"), true);
  assert.equal(policy.isAllowedRequestOrigin("https://attacker.example", "api.waltajjii.example"), false);
  assert.equal(policy.isAllowedRequestOrigin("javascript:alert(1)", "api.waltajjii.example"), false);
});

test("Phase 88: live SQLite server source retains JWT, Socket.IO and origin verification boundaries", () => {
  const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
  assert.match(server, /jwt\.verify\(token, secret,\s*\{\s*issuer:\s*"waltajjii",\s*audience:\s*"waltajjii-users"/);
  assert.match(server, /io\.use\(\(socket, next\) =>/);
  assert.match(server, /socket\.handshake\.auth\?\.token/);
  assert.match(server, /originPolicy\.isAllowedRequestOrigin\(origin, requestHost\)/);
  assert.match(server, /app\.use\(helmet\(/);
});
