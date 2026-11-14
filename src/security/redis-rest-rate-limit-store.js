"use strict";

const INCREMENT_SCRIPT = [
  "local hits = redis.call('INCR', KEYS[1])",
  "if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "return { hits, ttl }"
].join("\n");

const DECREMENT_SCRIPT = [
  "local hits = redis.call('DECR', KEYS[1])",
  "if hits <= 0 then redis.call('DEL', KEYS[1]); return 0 end",
  "return hits"
].join("\n");

function createRedisRestRateLimitStore(options = {}) {
  const url = String(options.url || "").replace(/\/+$/, "");
  const token = String(options.token || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const prefix = options.prefix || "waltajjii:rate-limit:";
  let windowMs = 15 * 60 * 1000;

  if (!url || !token) {
    throw new Error("Redis REST URL and token are required.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch-compatible implementation is required.");
  }

  async function command(parts) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parts)
    });

    if (!response || !response.ok) {
      throw new Error("Shared rate-limit store request failed.");
    }
    const payload = await response.json();
    if (payload && payload.error) {
      throw new Error("Shared rate-limit store command failed.");
    }
    return payload ? payload.result : undefined;
  }

  return {
    // express-rate-limit v7 Store contract.
    init(optionsFromLimiter) {
      if (optionsFromLimiter && Number.isFinite(optionsFromLimiter.windowMs)) {
        windowMs = optionsFromLimiter.windowMs;
      }
    },

    async increment(key) {
      const result = await command([
        "EVAL",
        INCREMENT_SCRIPT,
        "1",
        prefix + String(key),
        String(windowMs)
      ]);
      if (!Array.isArray(result) || result.length < 2) {
        throw new Error("Shared rate-limit store returned an invalid increment result.");
      }
      const totalHits = Number(result[0]);
      const ttlMs = Number(result[1]);
      if (!Number.isFinite(totalHits) || !Number.isFinite(ttlMs)) {
        throw new Error("Shared rate-limit store returned non-numeric counters.");
      }
      return {
        totalHits,
        resetTime: new Date(Date.now() + Math.max(0, ttlMs))
      };
    },

    async decrement(key) {
      await command(["EVAL", DECREMENT_SCRIPT, "1", prefix + String(key)]);
    },

    async resetKey(key) {
      await command(["DEL", prefix + String(key)]);
    }
  };
}

module.exports = { createRedisRestRateLimitStore };
