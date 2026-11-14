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

test("Phase 82 limits repeated unsuccessful login attempts", async () => {
  await withServer(async base => {
    for (let i = 0; i < 5; i++) {
      const response = await fetch(base + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valid: false }) });
      assert.equal(response.status, 401);
    }
    const blocked = await fetch(base + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valid: false }) });
    assert.equal(blocked.status, 429);
  });
});

test("Phase 82 keeps registration and login limits independent", async () => {
  await withServer(async base => {
    for (let i = 0; i < 5; i++) {
      const response = await fetch(base + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valid: false }) });
      assert.equal(response.status, 401);
    }
    const registration = await fetch(base + "/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(registration.status, 201);
  });
});
