"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { createAuthRateLimiters } = require("../src/security/auth-rate-limiters");

async function withServer(handler) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  const { loginLimiter } = createAuthRateLimiters(rateLimit);
  app.post("/login", loginLimiter, (_req, res) => {
    res.status(401).json({ error: "Invalid username or password." });
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    await handler("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

async function failedLogin(base, forwardedFor) {
  const headers = { "Content-Type": "application/json" };
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  return fetch(base + "/login", {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });
}

test("Phase 84: the right-most forwarded address represents the client behind one trusted proxy", async () => {
  await withServer(async base => {
    for (let i = 0; i < 4; i++) {
      assert.equal(
        (await failedLogin(base, "198.51.100.77, 203.0.113.9")).status,
        401
      );
    }

    // A different untrusted left-most value must not change the client bucket.
    assert.equal((await failedLogin(base, "192.0.2.44, 203.0.113.9")).status, 401);
    assert.equal((await failedLogin(base, "203.0.113.9")).status, 429);

    // A different client address receives an independent allowance.
    assert.equal((await failedLogin(base, "203.0.113.10")).status, 401);
  });
});

test("Phase 84: requests without a forwarded address use the direct peer address", async () => {
  await withServer(async base => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await failedLogin(base)).status, 401);
    }
    assert.equal((await failedLogin(base)).status, 429);
  });
});
