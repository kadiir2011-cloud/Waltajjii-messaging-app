"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

test("group call exposes user-controlled microphone and camera toggles", () => {
  assert.match(html, /id="wt-group-call-mic"/);
  assert.match(html, /id="wt-group-call-camera"/);
  assert.match(app, /groupCallLocalStream\?\.getAudioTracks\(\)/);
  assert.match(app, /groupCallLocalStream\?\.getVideoTracks\(\)/);
  assert.match(app, /tracks\.forEach\(track => \{ track\.enabled = enable; \}\)/);
  assert.match(app, /updateGroupCallControls\(\)/);
});

test("participant roster is built from active call tiles and offers focus selection", () => {
  assert.match(html, /id="wt-group-call-roster"/);
  assert.match(app, /function refreshGroupCallRoster\(\)/);
  assert.match(app, /groupCallPinnedUserId/);
  assert.match(app, /aria-label", \(groupCallPinnedUserId/);
});

test("grid and focus layouts can be switched without changing signaling", () => {
  assert.match(html, /id="wt-group-call-layout"/);
  assert.match(app, /function applyGroupCallLayout\(\)/);
  assert.match(app, /groupCallLayout === "grid" \? "focus" : "grid"/);
  assert.match(app, /data-layout/);
});

test("controls disable and roster clears when the group call ends", () => {
  assert.match(app, /groupCallGrid\?\.replaceChildren\(\)/);
  assert.match(app, /updateGroupCallControls\(\)/);
  assert.match(app, /groupCallRoster\.hidden = !active/);
});
