"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

test("group-call entry requests are authenticated group-member actions and do not start media", () => {
  assert.match(server, /socket\.on\("group-call:request-join"/);
  assert.match(server, /!isCurrentGroupMember\(groupId, socket\.data\.userId\)/);
  assert.match(server, /call\.waitingRoom\.set\(userId/);
  assert.match(server, /group-call:join-requested/);
  const joinFunction = app.slice(app.indexOf("async function joinGroupVideoCall()"), app.indexOf("async function completeApprovedGroupVideoJoin"));
  assert.match(joinFunction, /group-call:request-join/);
  assert.doesNotMatch(joinFunction, /getUserMedia/);
});

test("only the active call host can admit or decline a waiting participant", () => {
  assert.match(server, /call\.hostId !== String\(socket\.data\.userId\)/);
  assert.match(server, /socket\.on\("group-call:admit"/);
  assert.match(server, /socket\.on\("group-call:deny"/);
  assert.match(server, /group-call:admitted/);
  assert.match(server, /group-call:denied/);
  assert.match(app, /group-call:join-requested/);
  assert.match(app, /group-call:admit/);
  assert.match(app, /group-call:deny/);
});

test("the server refuses direct joining without a one-time host admission", () => {
  assert.match(server, /call\.admitted\?\.get\(userId\) !== socket\.id/);
  assert.match(server, /Wait for the host to admit this device from the waiting room/);
  assert.match(server, /call\.admitted\.delete\(userId\)/);
});

test("camera and microphone are requested only after the host admission event", () => {
  const admitted = app.slice(app.indexOf("async function completeApprovedGroupVideoJoin"), app.indexOf("function renderGroupCallWaitingRequest"));
  assert.match(admitted, /getUserMedia\(\{ video: true, audio: true \}\)/);
  assert.match(app, /socket\.on\("group-call:admitted"/);
  assert.match(html, /id="wt-group-call-waiting-room"/);
  assert.match(html, /id="wt-group-call-waiting-list"/);
});

test("waiting-room responses are sent to the requesting socket, and pending users are cleared when the call ends", () => {
  assert.match(server, /socketId: socket\.id/);
  assert.match(server, /io\.to\(pending\.socketId\)\.emit\("group-call:admitted"/);
  assert.match(server, /io\.to\(pending\.socketId\)\.emit\("group-call:denied"/);
  assert.match(server, /for \(const pending of call\.waitingRoom\?\.values\(\) \|\| \[\]\)/);
  assert.match(server, /pending\?\.socketId === socket\.id/);
  assert.match(server, /call\.admitted\?\.get\(disconnectedUserId\) === socket\.id/);
});
