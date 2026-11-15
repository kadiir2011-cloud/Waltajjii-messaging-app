"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresGroupEventReminderWorker } = require("../src/workers/postgres-group-event-reminder-worker");

test("PostgreSQL reminder worker prevents overlapping delivery and stops cleanly", async () => {
  let scheduled;
  let cleared = false;
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const worker = createPostgresGroupEventReminderWorker({
    governanceService: { deliverDueEventReminders: async () => { calls++; await pending; return { delivered: 2 }; } },
    intervalMs: 30000,
    setIntervalImpl: callback => { scheduled = callback; return { unref() {} }; },
    clearIntervalImpl: () => { cleared = true; },
    logger: { error() {} }
  });
  assert.equal(worker.running, false);
  assert.equal(worker.start({ runImmediately: false }), true);
  assert.equal(worker.start(), false, "start must be idempotent");
  assert.equal(worker.running, true);

  scheduled();
  scheduled();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1, "overlapping timer ticks must share one in-flight delivery batch");

  release();
  await worker.runOnce();
  await worker.stop();
  assert.equal(worker.running, false);
  assert.equal(cleared, true);
});

test("PostgreSQL reminder worker requires a complete service and safe interval", () => {
  assert.throws(() => createPostgresGroupEventReminderWorker({ governanceService: {} }), /deliverDueEventReminders/);
  assert.throws(() => createPostgresGroupEventReminderWorker({
    governanceService: { deliverDueEventReminders: async () => ({ delivered: 0 }) },
    intervalMs: 100
  }), /at least 1000 ms/);
});
