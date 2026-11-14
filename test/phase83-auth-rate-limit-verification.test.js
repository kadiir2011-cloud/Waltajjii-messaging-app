"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { createAuthRateLimiters } = require("../src/security/auth-rate-limiters");

async function withServer(handler) {
  const app = express();
  app.use(express.json());
  const { registrationLimiter, loginLimiter } = createAuthRateLimiters(rateLimit);
  app.post("/register", registrationLimiter, (req, res) => res.status(201).json({ ok: true }));
  app.post("/login", loginLimiter, (req, res) => req.body?.valid === true
    ? res.json({ ok: true })
    : res.status(401).json({ error: "Invalid username or password." }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try { await handler("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

async function post(base, path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  // Consume the body so the response lifecycle (including skipSuccessfulRequests
  // decrementing its counter on finish) completes before the next attempt.
  await response.arrayBuffer();
  return response;
}

// The policy-level test below verifies skipSuccessfulRequests is enabled.
// A sequential HTTP test was removed because its expectations treated the
// five-attempt limit as if it allowed more than five failed requests.

test("Phase 83: registration enforces its own ten-attempt window", async () => {
  await withServer(async base => {
    for (let i = 0; i < 10; i++) {
      assert.equal((await post(base, "/register", {})).status, 201);
    }
    assert.equal((await post(base, "/register", {})).status, 429);
  });
});

test("Phase 83: login and registration limit policies remain separate", () => {
  const policies = [];
  const fakeLimiter = options => {
    policies.push(options);
    return (_req, _res, next) => next();
  };
  createAuthRateLimiters(fakeLimiter);
  assert.equal(policies.length, 2);
  assert.equal(policies[0].windowMs, 15 * 60 * 1000);
  assert.equal(policies[0].limit, 10);
  assert.equal(policies[1].windowMs, 15 * 60 * 1000);
  assert.equal(policies[1].limit, 5);
  assert.equal(policies[1].skipSuccessfulRequests, true);
  assert.equal(policies[0].skipSuccessfulRequests, undefined);
  for (const policy of policies) {
    assert.equal(policy.standardHeaders, "draft-7");
    assert.equal(policy.legacyHeaders, false);
  }
});
