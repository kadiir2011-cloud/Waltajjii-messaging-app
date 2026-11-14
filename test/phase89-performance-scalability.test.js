"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createPostgresAuthRouter } = require("../src/routes/postgres-auth");
const { attachPostgresRealtime } = require("../src/postgres/postgres-realtime-socket");

const secret = "phase89-performance-test-secret-with-at-least-32-characters";
const issuer = "waltajjii";
const audience = "waltajjii-users";

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function tokenFor(userId) {
  return jwt.sign(
    { userId, username: "load_user_" + userId },
    secret,
    { expiresIn: "2h", issuer, audience }
  );
}

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createPostgresAuthRouter({
    jwt,
    jwtSecret: secret,
    limiter: (req, res, next) => next(),
    authService: {
      async register() { return { message: "ok" }; },
      async login() { throw new Error("Not used by this benchmark"); },
      async getProfile(userId) {
        await new Promise(resolve => setImmediate(resolve));
        return { user: { id: userId, username: "load_user_" + userId } };
      },
      async updateProfile(userId) { return { user: { id: userId } }; }
    }
  }));
  const server = http.createServer(app);
  server.keepAliveTimeout = 1000;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run("http://127.0.0.1:" + server.address().port);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function createSocketMiddleware() {
  const middleware = [];
  const io = { use(fn) { middleware.push(fn); }, on() {} };
  attachPostgresRealtime(io, {
    jwt,
    jwtSecret: secret,
    realtimeService: {
      async listGroupIdsForUser() { return []; },
      async isGroupMember() { return false; },
      async markMessageDelivered() { return null; }
    }
  });
  return middleware[0];
}

test("Phase 89: authenticated HTTP profile throughput remains correct under concurrent requests", async () => {
  const total = 120;
  const concurrency = 24;
  const cases = Array.from({ length: total }, (_, index) => {
    const userId = 1000 + index;
    return { userId, token: tokenFor(userId) };
  });
  const latencies = [];
  let completed = 0;

  await withServer(async base => {
    for (let offset = 0; offset < cases.length; offset += concurrency) {
      const batch = cases.slice(offset, offset + concurrency);
      const results = await Promise.all(batch.map(async item => {
        const started = process.hrtime.bigint();
        const response = await fetch(base + "/api/auth/profile", {
          headers: { authorization: "Bearer " + item.token }
        });
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        latencies.push(elapsedMs);
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(Number(payload.user.id), item.userId, "concurrent requests must not cross user identity");
        completed += 1;
      }));
      assert.equal(results.length, batch.length);
    }
  });

  const p50 = percentile(latencies, 0.50);
  const p95 = percentile(latencies, 0.95);
  console.log("[Phase 89] HTTP profile requests:", completed,
    "p50:", p50.toFixed(1) + "ms", "p95:", p95.toFixed(1) + "ms");
  assert.equal(completed, total);
  assert.ok(p95 < 5000, "synthetic HTTP p95 should remain below the generous 5-second CI ceiling");
});

test("Phase 89: Socket.IO JWT handshake verification handles a concurrent connection burst", async () => {
  const authenticate = createSocketMiddleware();
  const total = 200;
  const started = process.hrtime.bigint();
  const outcomes = await Promise.all(Array.from({ length: total }, async (_, index) => {
    const userId = 5000 + index;
    const socket = {
      handshake: { auth: { token: tokenFor(userId) } },
      data: {}
    };
    const error = await new Promise(resolve => authenticate(socket, resolve));
    return { error, userId, data: socket.data };
  }));
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(outcomes.length, total);
  for (const outcome of outcomes) {
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.data.userId, String(outcome.userId));
    assert.equal(outcome.data.username, "load_user_" + outcome.userId);
  }
  console.log("[Phase 89] Socket.IO handshake burst:", total,
    "connections in", elapsedMs.toFixed(1) + "ms");
  assert.ok(elapsedMs < 5000, "synthetic Socket.IO handshake burst should remain below 5 seconds");
});
