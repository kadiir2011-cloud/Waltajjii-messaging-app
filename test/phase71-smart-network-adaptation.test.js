"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

test("adaptive video quality is user-controllable and disclosed in the call UI", () => {
  assert.match(html, /id="wt-call-adaptive" checked/);
  assert.match(html, /Automatically adapt video quality to network conditions/i);
  assert.match(html, /Voice calls are not changed/i);
  assert.match(html, /adjustments are made on this device only/i);
});

test("network adaptation uses local video sender parameters without touching audio", () => {
  assert.match(app, /peerConnection\.getSenders\(\)\.find\(sender => sender\.track\?\.kind === "video"\)/);
  assert.match(app, /videoSender\.getParameters\(\)/);
  assert.match(app, /videoSender\.setParameters\(parameters\)/);
  assert.match(app, /maxBitrate: selected\.maxBitrate/);
  assert.match(app, /maxFramerate: selected\.maxFramerate/);
  assert.match(app, /scaleResolutionDownBy: selected\.scaleResolutionDownBy/);
});

test("adaptation responds conservatively to sustained quality changes", () => {
  assert.match(app, /adaptivePoorSamples >= 2/);
  assert.match(app, /adaptiveFairSamples >= 2/);
  assert.match(app, /adaptiveGoodSamples >= 3/);
  assert.match(app, /applyAdaptiveVideoQuality\("conserve"\)/);
  assert.match(app, /applyAdaptiveVideoQuality\("balanced"\)/);
  assert.match(app, /applyAdaptiveVideoQuality\("high"\)/);
});

test("disabling adaptation restores standard video settings and call teardown resets state", () => {
  assert.match(app, /Automatic video adaptation is off; restoring standard video quality/);
  assert.match(app, /adaptivePoorSamples = 0/);
  assert.match(app, /adaptiveVideoProfile = "high"/);
  assert.match(app, /callAdaptiveToggle\.addEventListener\("change"/);
});
