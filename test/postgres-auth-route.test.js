"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createPostgresAuthRouter } = require("../src/routes/postgres-auth");

const secret = "test-secret-that-is-at-least-32-characters";
const jwt = {
  verify(token, suppliedSecret, options) {
    assert.equal(suppliedSecret, secret);
    assert.equal(options.issuer, "waltajjii");
    assert.equal(options.audience, "waltajjii-users");
    if (token !== "valid-token") throw new Error("invalid");
    return { userId: "42", username: "kedir" };
  }
};

async function withServer(authService, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createPostgresAuthRouter({
    authService, jwt, jwtSecret: secret,
    limiter: (req, res, next) => next()
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function service(overrides = {}) {
  return {
    async register(input) {
      if (overrides.register) return overrides.register(input);
      return { message: "Account created successfully.", user: { id: "43", username: input.username } };
    },
    async login(input) {
      if (overrides.login) return overrides.login(input);
      return { message: "Login successful.", token: "jwt-token", user: { id: "42", username: input.username } };
    },
    async getProfile(id) {
      if (overrides.getProfile) return overrides.getProfile(id);
      return { user: { id, username: "kedir", fullName: "Kedir" } };
    },
    async updateProfile(id, input) {
      if (overrides.updateProfile) return overrides.updateProfile(id, input);
      return { message: "Profile updated successfully.", fullName: input.fullName || "" };
    }
  };
}

test("registration forwards payload and preserves HTTP 201 response contract", async () => {
  let received;
  await withServer(service({ register: async input => {
    received = input;
    return { message: "Account created successfully.", user: { id: "43", username: "kedir" } };
  }}), async base => {
    const response = await fetch(base + "/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "kedir", password: "long-password-123" })
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).user.id, "43");
    assert.equal(received.username, "kedir");
  });
});

test("duplicate registration service errors preserve HTTP conflict response", async () => {
  await withServer(service({ register: async () => {
    const error = new Error("That username is already taken.");
    error.status = 409;
    throw error;
  }}), async base => {
    const response = await fetch(base + "/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}"
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "That username is already taken.");
  });
});

test("login returns service token and user response", async () => {
  await withServer(service(), async base => {
    const response = await fetch(base + "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "kedir", password: "correct-password" })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, "jwt-token");
  });
});

test("profile routes require a valid Bearer token and pass the verified user ID", async () => {
  let profileUserId;
  await withServer(service({ getProfile: async id => {
    profileUserId = id;
    return { user: { id, username: "kedir" } };
  }}), async base => {
    const missing = await fetch(base + "/api/auth/profile");
    assert.equal(missing.status, 401);
    const invalid = await fetch(base + "/api/auth/profile", {
      headers: { authorization: "Bearer bad-token" }
    });
    assert.equal(invalid.status, 401);
    const valid = await fetch(base + "/api/auth/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    assert.equal(valid.status, 200);
    assert.equal(profileUserId, "42");
  });
});

test("profile update passes user ID and payload and preserves success response", async () => {
  let args;
  await withServer(service({ updateProfile: async (id, input) => {
    args = { id, input };
    return { message: "Profile updated successfully.", fullName: input.fullName };
  }}), async base => {
    const response = await fetch(base + "/api/auth/profile", {
      method: "PATCH",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Kedir" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(args, { id: "42", input: { fullName: "Kedir" } });
    assert.equal((await response.json()).fullName, "Kedir");
  });
});

test("unexpected service errors do not expose database diagnostics", async () => {
  await withServer(service({ login: async () => {
    throw new Error("postgres://secret-password@db.example/private");
  }}), async base => {
    const response = await fetch(base + "/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}"
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, "Could not log in.");
  });
});
