"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
test("call quality monitor is visible and explains local-only measurement", () => {
  assert.match(html, /id="wt-call-quality"/);
  assert.match(html, /measured on this device only and are not stored/i);
});
test("monitor reads WebRTC stats and displays network indicators", () => {
  assert.match(app, /peerConnection\.getStats\(\)/);
  assert.match(app, /currentRoundTripTime/);
  assert.match(app, /report\.jitter/);
  assert.match(app, /report\.packetsLost/);
  assert.match(app, /Connection quality: /);
  assert.match(app, /RTT: /);
  assert.match(app, /Jitter: /);
  assert.match(app, /Packet loss: /);
});
test("polling starts with media connection and stops when call ends", () => {
  assert.match(app, /startCallQualityMonitor\(\);/);
  assert.match(app, /callQualityTimer = setInterval\(updateCallQuality, 5000\)/);
  assert.match(app, /if \(callQualityTimer\) clearInterval\(callQualityTimer\)/);
  assert.match(app, /callQualityTimer = null/);
});
