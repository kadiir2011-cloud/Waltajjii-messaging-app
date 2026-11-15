"use strict";

function createPostgresMediaCleanupWorker({
  mediaStorage,
  intervalMs = 60000,
  batchSize = 25,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  logger = console
} = {}) {
  if (!mediaStorage || typeof mediaStorage.processCleanupQueue !== "function") {
    throw new TypeError("A PostgreSQL media storage service with processCleanupQueue() is required.");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new TypeError("Cleanup interval must be at least 1000 ms.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new TypeError("Cleanup batch size must be 1–100.");
  let timer = null;
  let inFlight = null;

  function runOnce() {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(() => mediaStorage.processCleanupQueue(batchSize))
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  function tick() {
    runOnce().catch(error => {
      try { logger.error("PostgreSQL media cleanup worker failed:", error?.message || "Unknown error"); }
      catch { /* logging must not crash the worker */ }
    });
  }

  function start({ runImmediately = true } = {}) {
    if (timer !== null) return false;
    timer = setIntervalImpl(tick, intervalMs);
    if (timer && typeof timer.unref === "function") timer.unref();
    if (runImmediately) tick();
    return true;
  }

  async function stop() {
    if (timer !== null) {
      clearIntervalImpl(timer);
      timer = null;
    }
    if (inFlight) {
      try { await inFlight; } catch { /* tick already logs failures */ }
    }
  }

  return Object.freeze({ start, stop, runOnce, tick, get running() { return timer !== null; } });
}

module.exports = { createPostgresMediaCleanupWorker };
