"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { createPostgresAudioIntelligenceRouter } = require("../src/routes/postgres-audio-intelligence");

const secret = "phase66-audio-test-secret-with-more-than-32-characters";
const token = jwt.sign({ userId: "166", username: "phase66-user" }, secret, { issuer: "waltajjii", audience: "waltajjii-users" });

async function withServer(router, run) {
  const app = express();
  app.use("/api/audio", router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function audioForm() {
  const form = new FormData();
  form.append("audio", new Blob([Buffer.from("fake-webm-audio")], { type: "audio/webm" }), "voice.webm");
  form.append("language", "am");
  return form;
}

test("audio transcription requires authentication and never calls the provider anonymously", async () => {
  let calls = 0;
  const router = createPostgresAudioIntelligenceRouter({ jwtSecret: secret, apiKey: "test-key", fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ text: "hello" }) }; }, limiter: (req,res,next) => next() });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/audio/transcribe", { method: "POST", body: audioForm() });
    assert.equal(response.status, 401);
  });
  assert.equal(calls, 0);
});

test("audio transcription forwards an in-memory audio blob and returns only transcript text", async () => {
  let providerRequest;
  const router = createPostgresAudioIntelligenceRouter({
    jwtSecret: secret,
    apiKey: "test-provider-key",
    model: "test-transcribe-model",
    fetchImpl: async (url, options) => {
      providerRequest = { url, options };
      return { ok: true, json: async () => ({ text: "  Hello from a voice note.  " }) };
    },
    limiter: (req,res,next) => next()
  });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/audio/transcribe", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: audioForm()
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { transcript: "Hello from a voice note.", language: "am" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  assert.equal(providerRequest.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(providerRequest.options.headers.Authorization, "Bearer test-provider-key");
  assert.equal(providerRequest.options.body.get("model"), "test-transcribe-model");
  assert.equal(providerRequest.options.body.get("languages[]"), "am");
  assert.equal(providerRequest.options.body.get("file").size, Buffer.byteLength("fake-webm-audio"));
});

test("audio transcription validates language hints and supported MIME types before provider use", async () => {
  let calls = 0;
  const router = createPostgresAudioIntelligenceRouter({ jwtSecret: secret, apiKey: "test-key", fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ text: "x" }) }; }, limiter: (req,res,next) => next() });
  await withServer(router, async base => {
    const badLanguage = new FormData();
    badLanguage.append("audio", new Blob(["audio"], { type: "audio/webm" }), "voice.webm");
    badLanguage.append("language", "not-a-language");
    const bad = await fetch(base + "/api/audio/transcribe", { method: "POST", headers: { Authorization: "Bearer " + token }, body: badLanguage });
    assert.equal(bad.status, 400);
    const wrongType = new FormData();
    wrongType.append("audio", new Blob(["not audio"], { type: "text/plain" }), "notes.txt");
    const rejected = await fetch(base + "/api/audio/transcribe", { method: "POST", headers: { Authorization: "Bearer " + token }, body: wrongType });
    assert.equal(rejected.status, 400);
  });
  assert.equal(calls, 0);
});

test("audio transcription fails closed when provider configuration is missing", async () => {
  const router = createPostgresAudioIntelligenceRouter({ jwtSecret: secret, apiKey: "", limiter: (req,res,next) => next() });
  await withServer(router, async base => {
    const response = await fetch(base + "/api/audio/transcribe", { method: "POST", headers: { Authorization: "Bearer " + token }, body: audioForm() });
    assert.equal(response.status, 503);
  });
});

test("audio transcription hides provider diagnostics and handles empty transcripts", async () => {
  const failedRouter = createPostgresAudioIntelligenceRouter({ jwtSecret: secret, apiKey: "private-key", fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: "private provider detail" }) }), limiter: (req,res,next) => next() });
  await withServer(failedRouter, async base => {
    const response = await fetch(base + "/api/audio/transcribe", { method: "POST", headers: { Authorization: "Bearer " + token }, body: audioForm() });
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, /private-key|private provider detail/);
  });
  const emptyRouter = createPostgresAudioIntelligenceRouter({ jwtSecret: secret, apiKey: "private-key", fetchImpl: async () => ({ ok: true, json: async () => ({ text: " " }) }), limiter: (req,res,next) => next() });
  await withServer(emptyRouter, async base => {
    const response = await fetch(base + "/api/audio/transcribe", { method: "POST", headers: { Authorization: "Bearer " + token }, body: audioForm() });
    assert.equal(response.status, 502);
  });
});
