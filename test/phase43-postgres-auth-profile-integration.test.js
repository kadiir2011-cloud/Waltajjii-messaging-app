"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createPostgresAdapter } = require("../src/db/postgres-adapter");
const { createPostgresAuthService } = require("../src/services/postgres-auth-service");
const { createPostgresAuthRouter } = require("../src/routes/postgres-auth");

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must point only to the disposable CI PostgreSQL service");
}

const pool = new Pool({
  connectionString,
  max: 3,
  options: "-c search_path=waltajjii,public"
});
const adapter = createPostgresAdapter(pool);
const secret = "phase43-disposable-ci-secret-at-least-32-characters";
const service = createPostgresAuthService({
  db: adapter, bcrypt, jwt, jwtSecret: secret
});

async function withHttpServer(run) {
  const app = express();
  app.use(express.json({ limit: "20kb" }));
  app.use("/api/auth", createPostgresAuthRouter({
    authService: service,
    jwt,
    jwtSecret: secret,
    limiter: (req, res, next) => next()
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    );
  }
}

test("Phase 43: real PostgreSQL registration, login, JWT, and profile HTTP flow", async () => {
  const ddl = fs.readFileSync(
    path.join(__dirname, "..", "migrations/postgres/001_initial_schema.sql"),
    "utf8"
  );
  await pool.query(ddl);

  const username = "phase43_" + Date.now();
  const password = "Phase43-Integration-Password!";
  let userId;

  try {
    await withHttpServer(async base => {
      const register = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      assert.equal(register.status, 201);
      const registered = await register.json();
      assert.equal(registered.message, "Account created successfully.");
      assert.equal(registered.user.username, username);
      userId = registered.user.id;
      assert.ok(BigInt(userId) > 0n, "PostgreSQL BIGINT identity is returned safely");

      const duplicate = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.toUpperCase(), password })
      });
      assert.equal(duplicate.status, 409);

      const invalidRegistration = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "x", password: "short" })
      });
      assert.equal(invalidRegistration.status, 400);

      const login = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.toUpperCase(), password })
      });
      assert.equal(login.status, 200);
      const loggedIn = await login.json();
      assert.equal(loggedIn.message, "Login successful.");
      assert.equal(loggedIn.user.id, userId);
      const claims = jwt.verify(loggedIn.token, secret, {
        issuer: "waltajjii",
        audience: "waltajjii-users"
      });
      assert.equal(String(claims.userId), String(userId));
      assert.equal(claims.username, username);

      const badLogin = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password: "incorrect-password" })
      });
      assert.equal(badLogin.status, 401);

      const noToken = await fetch(base + "/api/auth/profile");
      assert.equal(noToken.status, 401);

      const profileResponse = await fetch(base + "/api/auth/profile", {
        headers: { authorization: "Bearer " + loggedIn.token }
      });
      assert.equal(profileResponse.status, 200);
      const profile = (await profileResponse.json()).user;
      assert.equal(String(profile.id), String(userId));
      assert.equal(profile.username, username);
      assert.equal(profile.fullName, "");
      assert.equal(profile.profileBackground, "mist");
      assert.equal(profile.profileMode, "both");

      const update = await fetch(base + "/api/auth/profile", {
        method: "PATCH",
        headers: {
          authorization: "Bearer " + loggedIn.token,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          fullName: "Phase 43 Test User",
          profileBackground: "ocean",
          bio: "PostgreSQL auth/profile integration test",
          professionalTitle: "Test clinician",
          organization: "Waltajjii CI",
          department: "Integration",
          location: "Jimma",
          website: "https://example.org",
          profileMode: "professional"
        })
      });
      assert.equal(update.status, 200);
      const updated = await update.json();
      assert.equal(updated.fullName, "Phase 43 Test User");
      assert.equal(updated.profileBackground, "ocean");
      assert.equal(updated.profileMode, "professional");

      const persistedResponse = await fetch(base + "/api/auth/profile", {
        headers: { authorization: "Bearer " + loggedIn.token }
      });
      const persisted = (await persistedResponse.json()).user;
      assert.equal(persisted.fullName, "Phase 43 Test User");
      assert.equal(persisted.bio, "PostgreSQL auth/profile integration test");
      assert.equal(persisted.professionalTitle, "Test clinician");
      assert.equal(persisted.organization, "Waltajjii CI");
      assert.equal(persisted.department, "Integration");
      assert.equal(persisted.location, "Jimma");
      assert.equal(persisted.website, "https://example.org");
      assert.equal(persisted.profileMode, "professional");

      const invalidUpdate = await fetch(base + "/api/auth/profile", {
        method: "PATCH",
        headers: {
          authorization: "Bearer " + loggedIn.token,
          "content-type": "application/json"
        },
        body: JSON.stringify({ website: "not-a-url" })
      });
      assert.equal(invalidUpdate.status, 400);
      assert.match((await invalidUpdate.json()).error, /Website must begin/);
    });
  } finally {
    if (userId) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  }
});

test.after(async () => {
  await pool.end();
});
