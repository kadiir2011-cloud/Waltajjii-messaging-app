"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");

test("call UI exposes an opt-in reconnect control and explains its limits", () => {
  assert.match(html, /id="wt-call-reconnect"/);
  assert.match(html, /ICE restart/i);
  assert.match(html, /not guaranteed on every network/i);
});

test("interrupted peer connections enable reconnect and healthy connections clear recovery state", () => {
  assert.match(app, /connectionState === "disconnected" \|\| peerConnection\.connectionState === "failed"/);
  assert.match(app, /callReconnectButton\.disabled = false/);
  assert.match(app, /callRecoveryInProgress = false/);
});

test("recovery uses ICE restart and authenticated peer-scoped signaling", () => {
  assert.match(app, /createOffer\(\{ iceRestart: true \}\)/);
  assert.match(app, /call:recovery-request/);
  assert.match(app, /call:recovery-offer/);
  assert.match(app, /call:recovery-answer/);
  assert.match(server, /activeCalls\.get\(senderId\) !== targetUserId \|\| activeCalls\.get\(targetUserId\) !== senderId/);
  assert.match(server, /call:recovery-requested/);
  assert.match(server, /call:recovery-offer/);
  assert.match(server, /call:recovery-answer/);
});

test("ICE candidates are buffered during recovery and call teardown clears recovery state", () => {
  assert.match(app, /peerConnection\?\.remoteDescription && !callRecoveryInProgress/);
  assert.match(app, /pendingIceCandidates\.push\(data\.candidate\)/);
  assert.match(app, /callRecoveryInProgress = false/);
  assert.match(app, /if \(callReconnectButton\) callReconnectButton\.disabled = true/);
});
