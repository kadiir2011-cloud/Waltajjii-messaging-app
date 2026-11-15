"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { createPostgresAiAssistantRouter } = require("../src/routes/postgres-ai-assistant");

const secret = "phase64-ai-assistant-test-secret-with-more-than-32-characters";
const token = jwt.sign(
  { userId: "101", username: "phase64-user" },
  secret,
  { issuer: "waltajjii", audience: "waltajjii-users" }
);

async function withServer(router, run) {
  const app = express();
  app.use(express.json({ limit: "20kb" }));
  app.use("/api/ai", router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function providerResponse(text) {
  return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text }] }] }) };
}

test("AI assistant authenticates users and never calls the provider for anonymous requests", async () => {
  let calls = 0;
  const router = createPostgresAiAssistantRouter({
    jwtSecret: secret,
    apiKey: "test-provider-key",
    fetchImpl: async () => { calls++; return providerResponse("summary"); },
    limiter: (req, res, next) => next()
  });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/ai/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "summarize", context: "A selected conversation." })
    });
    assert.equal(response.status, 401);
  });
  assert.equal(calls, 0);
});

test("AI assistant supports summary, reply drafting and task extraction without sending or persisting content", async () => {
  const requests = [];
  const router = createPostgresAiAssistantRouter({
    jwtSecret: secret,
    apiKey: "test-provider-key",
    model: "test-model",
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return providerResponse("A concise result.");
    },
    limiter: (req, res, next) => next()
  });
  await withServer(router, async base => {
    for (const action of ["summarize", "suggest_reply", "extract_tasks"]) {
      const response = await fetch(base + "/api/ai/assist", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ action, context: "Meeting on Friday. A draft should be prepared." })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        action, result: "A concise result.", outputLanguage: null
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
  assert.equal(requests[0].body.model, "test-model");
  assert.match(requests[0].body.instructions, /untrusted quoted data/);
  assert.match(requests[1].body.instructions, /Do not send messages/);
  assert.match(requests[2].body.instructions, /Do not create or schedule tasks/);
  assert.match(requests[0].body.input, /Meeting on Friday/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-provider-key");
});

test("AI assistant validates actions, context length and supported output languages", async () => {
  const router = createPostgresAiAssistantRouter({
    jwtSecret: secret,
    apiKey: "test-provider-key",
    fetchImpl: async () => providerResponse("unused"),
    limiter: (req, res, next) => next()
  });
  await withServer(router, async base => {
    const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
    const invalidAction = await fetch(base + "/api/ai/assist", {
      method: "POST", headers, body: JSON.stringify({ action: "delete_messages", context: "Hello" })
    });
    assert.equal(invalidAction.status, 400);
    const emptyContext = await fetch(base + "/api/ai/assist", {
      method: "POST", headers, body: JSON.stringify({ action: "summarize", context: "  " })
    });
    assert.equal(emptyContext.status, 400);
    const longContext = await fetch(base + "/api/ai/assist", {
      method: "POST", headers, body: JSON.stringify({ action: "summarize", context: "x".repeat(8001) })
    });
    assert.equal(longContext.status, 400);
    const unsupportedLanguage = await fetch(base + "/api/ai/assist", {
      method: "POST", headers, body: JSON.stringify({ action: "summarize", context: "Hello", outputLanguage: "Klingon" })
    });
    assert.equal(unsupportedLanguage.status, 400);
  });
});

test("AI assistant fails closed when provider configuration is absent", async () => {
  const router = createPostgresAiAssistantRouter({
    jwtSecret: secret,
    apiKey: "",
    limiter: (req, res, next) => next()
  });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/ai/assist", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "summarize", context: "A selected conversation." })
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /test-provider-key/i);
  });
});

test("AI assistant hides provider diagnostics and secrets from clients", async () => {
  const router = createPostgresAiAssistantRouter({
    jwtSecret: secret,
    apiKey: "never-return-this-secret",
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: "secret detail" }) }),
    limiter: (req, res, next) => next()
  });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/ai/assist", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "summarize", context: "A selected conversation." })
    });
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.match(body, /could not complete/);
    assert.doesNotMatch(body, /never-return-this-secret|secret detail/i);
  });
});

test("AI assistant handles empty provider output without returning an empty success", async () => {
  const router = createPostgresAiAssistantRouter({
    jwtSecret: secret,
    apiKey: "test-provider-key",
    fetchImpl: async () => providerResponse("  "),
    limiter: (req, res, next) => next()
  });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/ai/assist", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest_reply", context: "A selected conversation." })
    });
    assert.equal(response.status, 502);
  });
});
