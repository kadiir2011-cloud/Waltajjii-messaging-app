"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

test("participants can raise and lower their own hand only while in the active call", () => {
  assert.match(server, /socket\.on\("group-call:hand-raise"/);
  assert.match(server, /!call\.participants\.has\(userId\)/);
  assert.match(server, /call\.handRaised\.add\(userId\)/);
  assert.match(server, /call\.handRaised\.delete\(userId\)/);
  assert.match(server, /group-call:hand-raised/);
  assert.match(html, /id="wt-group-call-hand"/);
  assert.match(app, /group-call:hand-raise/);
});

test("only the host or a current group admin can perform moderation actions", () => {
  assert.match(server, /SELECT role FROM group_members WHERE group_id = \? AND user_id = \?/);
  assert.match(server, /call\.hostId === actorId \|\| membership\?\.role === "admin"/);
  assert.match(server, /Only the call host or a group admin can moderate participants/);
  assert.match(server, /\["remove", "lower-hand", "request-mute"\]/);
});

test("participant removal clears server call membership and notifies the removed user", () => {
  assert.match(server, /call\.participants\.delete\(targetUserId\)/);
  assert.match(server, /activeGroupCallByUser\.delete\(targetUserId\)/);
  assert.match(server, /group-call:removed/);
  assert.ok(server.includes('socketsLeave(`group-call:${groupId}`)'));
  assert.match(app, /socket\.on\("group-call:removed"/);
  assert.match(app, /stopGroupVideoCall\(false\)/);
});

test("moderator mute is an explicit participant request, not remote track control", () => {
  assert.match(server, /group-call:mute-request/);
  assert.match(app, /window\.confirm\(\(data\.requestedBy/);
  assert.match(app, /tracks\.forEach\(track => \{ track\.enabled = false; \}\)/);
  assert.match(app, /They can accept or decline/);
});

test("host controls are presented only for other participants and hand state updates the roster", () => {
  assert.match(app, /function groupCallCanModerate\(\)/);
  assert.match(app, /groupCallCanModerate\(\)/);
  assert.match(app, /groupCallRaisedHands/);
  assert.match(app, /Request mute/);
  assert.match(app, /Remove/);
});
