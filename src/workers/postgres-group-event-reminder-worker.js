"use strict";

function createPostgresGroupEventReminderWorker({
  governanceService,
  intervalMs = 30000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  logger = console,
  onStatus = null,
  clock = () => new Date()
} = {}) {
  if (!governanceService || typeof governanceService.deliverDueEventReminders !== "function") {
    throw new TypeError("A PostgreSQL group governance service with deliverDueEventReminders() is required.");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new TypeError("Reminder interval must be at least 1000 ms.");
  if (typeof setIntervalImpl !== "function" || typeof clearIntervalImpl !== "function") {
    throw new TypeError("Interval scheduling functions are required.");
  }
  if (onStatus !== null && typeof onStatus !== "function") throw new TypeError("onStatus must be a function.");

  let timer = null;
  let inFlight = null;
  const state = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    consecutiveFailures: 0,
    lastStartedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastDurationMs: null,
    lastDelivered: 0,
    lastError: null
  };

  function nowIso() {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function snapshot() {
    return Object.freeze({
      running: timer !== null,
      inFlight: inFlight !== null,
      intervalMs,
      ...state
    });
  }

  function publish() {
    if (!onStatus) return;
    try { onStatus(snapshot()); }
    catch (error) {
      try { logger.error("Reminder worker status callback failed:", error?.message || "Unknown error"); }
      catch { /* status reporting must not crash reminder delivery */ }
    }
  }

  function runOnce() {
    if (inFlight) return inFlight;
    const startedAt = Date.now();
    state.totalRuns++;
    state.lastStartedAt = nowIso();
    state.lastError = null;
    inFlight = Promise.resolve()
      .then(() => governanceService.deliverDueEventReminders())
      .then(result => {
        state.successfulRuns++;
        state.consecutiveFailures = 0;
        state.lastSucceededAt = nowIso();
        state.lastDelivered = Number(result?.delivered) || 0;
        state.lastDurationMs = Math.max(0, Date.now() - startedAt);
        publish();
        return result;
      }, error => {
        state.failedRuns++;
        state.consecutiveFailures++;
        state.lastFailedAt = nowIso();
        state.lastDurationMs = Math.max(0, Date.now() - startedAt);
        state.lastError = String(error?.message || "Reminder delivery failed").slice(0, 500);
        publish();
        throw error;
      })
      .finally(() => { inFlight = null; });
    publish();
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
    publish();
    if (runImmediately) tick();
    return true;
  }

  async function stop() {
    if (timer !== null) {
      clearIntervalImpl(timer);
      timer = null;
    }
    publish();
    if (inFlight) {
      try { await inFlight; } catch { /* tick already logs failures */ }
    }
    publish();
  }

  return Object.freeze({
    start,
    stop,
    runOnce,
    tick,
    get running() { return timer !== null; },
    getStatus: snapshot
  });
}

module.exports = { createPostgresGroupEventReminderWorker };
