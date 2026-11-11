"use strict";

function createPostgresGroupEventReminderWorker({
  governanceService,
  intervalMs = 30000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  logger = console
} = {}) {
  if (!governanceService || typeof governanceService.deliverDueEventReminders !== "function") {
    throw new TypeError("A PostgreSQL group governance service with deliverDueEventReminders() is required.");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new TypeError("Reminder interval must be at least 1000 ms.");
  if (typeof setIntervalImpl !== "function" || typeof clearIntervalImpl !== "function") {
    throw new TypeError("Interval scheduling functions are required.");
  }

  let timer = null;
  let inFlight = null;

  function runOnce() {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(() => governanceService.deliverDueEventReminders())
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  function tick() {
    runOnce().catch(error => {
      try { logger.error("PostgreSQL group event reminder worker failed:", error?.message || "Unknown error"); }
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

module.exports = { createPostgresGroupEventReminderWorker };
