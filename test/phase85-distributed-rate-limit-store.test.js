"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRedisRestRateLimitStore } = require("../src/security/redis-rest-rate-limit-store");

function fakeFetch(results) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, command: JSON.parse(options.body) });
    const result = results.shift();
    return {
      ok: true,
      json: async () => ({ result })
    };
  };
  return { fetchImpl, calls };
}

test("Phase 85: increment uses one atomic Redis operation and returns the shared count", async () => {
  const fake = fakeFetch([[3, 42000]]);
  const store = createRedisRestRateLimitStore({
    url: "https://redis.example.test",
    token: "test-token",
    prefix: "test:rl:",
    fetchImpl: fake.fetchImpl
  });
  store.init({ windowMs: 60000 });

  const result = await store.increment("client-1");

  assert.equal(result.totalHits, 3);
  assert.ok(result.resetTime instanceof Date);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].url, "https://redis.example.test");
  assert.equal(fake.calls[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(fake.calls[0].command[0], "EVAL");
  assert.equal(fake.calls[0].command[2], "1");
  assert.equal(fake.calls[0].command[3], "test:rl:client-1");
  assert.equal(fake.calls[0].command[4], "60000");
});

test("Phase 85: decrement and resetKey use the configured namespace", async () => {
  const fake = fakeFetch([2, "OK"]);
  const store = createRedisRestRateLimitStore({
    url: "https://redis.example.test/",
    token: "test-token",
    prefix: "app:",
    fetchImpl: fake.fetchImpl
  });

  await store.decrement("ip-a");
  await store.resetKey("ip-b");

  assert.equal(fake.calls[0].command[0], "EVAL");
  assert.equal(fake.calls[0].command[3], "app:ip-a");
  assert.deepEqual(fake.calls[1].command, ["DEL", "app:ip-b"]);
});

test("Phase 85: missing configuration is rejected rather than silently using local memory", () => {
  assert.throws(
    () => createRedisRestRateLimitStore({ url: "https://redis.example.test" }),
    /URL and token are required/
  );
});

test("Phase 85: upstream failures are surfaced so callers can fail closed", async () => {
  const store = createRedisRestRateLimitStore({
    url: "https://redis.example.test",
    token: "test-token",
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  });

  await assert.rejects(() => store.increment("client-1"), /request failed/);
});

test("Phase 85: malformed Redis responses are rejected", async () => {
  const fake = fakeFetch(["not-an-array"]);
  const store = createRedisRestRateLimitStore({
    url: "https://redis.example.test",
    token: "test-token",
    fetchImpl: fake.fetchImpl
  });

  await assert.rejects(() => store.increment("client-1"), /invalid increment result/);
});
