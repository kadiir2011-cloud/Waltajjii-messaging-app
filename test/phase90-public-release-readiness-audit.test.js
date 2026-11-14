"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePublicReleaseReadiness } = require("../scripts/phase90-public-release-readiness-audit");

test("Phase 90: public release is blocked while critical durability and recovery gates remain open", () => {
  const report = evaluatePublicReleaseReadiness();
  assert.equal(report.phase, 90);
  assert.equal(report.status, "NOT_READY_FOR_PUBLIC_LAUNCH");
  assert.ok(report.blockerCount >= 8);
  const byId = Object.fromEntries(report.checks.map(item => [item.id, item]));
  for (const id of [
    "durable-system-of-record",
    "durable-media",
    "backup-restore-evidence",
    "account-recovery",
    "session-revocation"
  ]) {
    assert.ok(byId[id], "expected release gate " + id);
    assert.notEqual(byId[id].state, "passed");
  }
});

test("Phase 90: current security and migration safeguards are recorded as positive controls", () => {
  const report = evaluatePublicReleaseReadiness();
  const controls = Object.fromEntries(report.positiveControls.map(item => [item.id, item.present]));
  assert.equal(controls["jwt-scope"], true);
  assert.equal(controls["origin-policy"], true);
  assert.equal(controls.helmet, true);
  assert.equal(controls["migration-rehearsal"], true);
});
