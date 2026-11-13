"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");

test("group conference UI exposes start, join, leave and accessible participant video grid", () => {
  assert.match(html, /id="wt-group-call-start"/);
  assert.match(html, /id="wt-group-call-join"/);
  assert.match(html, /id="wt-group-call-leave"/);
  assert.match(html, /id="wt-group-call-grid"/);
  assert.match(html, /aria-live="polite"/);
});

test("group calls request camera and microphone only after user action", () => {
  assert.match(app, /async function startGroupVideoCall\(\)/);
  assert.match(app, /async function joinGroupVideoCall\(\)/);
  assert.match(app, /getUserMedia\(\{ video: true, audio: true \}\)/);
  assert.match(app, /groupCallStartButton\.addEventListener\("click", startGroupVideoCall\)/);
  assert.match(app, /groupCallJoinButton\.addEventListener\("click", joinGroupVideoCall\)/);
});

test("mesh connections exchange SDP and ICE per authenticated participant", () => {
  assert.match(app, /new RTCPeerConnection\(config\)/);
  assert.match(app, /group-call:offer/);
  assert.match(app, /group-call:answer/);
  assert.match(app, /group-call:ice-candidate/);
  assert.match(app, /connection\.addTrack\(track, groupCallLocalStream\)/);
  assert.match(app, /connection\.ontrack/);
});

test("participants can leave and all media tracks and peer connections are released", () => {
  assert.match(app, /function stopGroupVideoCall\(sendSignal = true\)/);
  assert.match(app, /groupPeerConnections\.forEach\(connection => connection\.close\(\)\)/);
  assert.match(app, /groupCallLocalStream\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(app, /group-call:participant-left/);
  assert.match(app, /group-call:ended/);
});

test("server advertises active conferences and authorizes status lookup for group members", () => {
  assert.match(server, /group-call:available/);
  assert.match(server, /socket\.on\("group-call:status"/);
  assert.match(server, /isCurrentGroupMember\(groupId, socket\.data\.userId\)/);
  assert.match(server, /call\.participants\.size >= 8/);
});
