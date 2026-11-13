"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");

test("group calls are tracked separately and require authenticated group membership", () => {
  assert.match(server, /const activeGroupCalls = new Map\(\)/);
  assert.match(server, /SELECT 1 FROM group_members WHERE group_id = \? AND user_id = \?/);
  assert.match(server, /socket\.on\("group-call:start"/);
  assert.match(server, /socket\.on\("group-call:join"/);
});

test("group calls enforce an eight-person limit and block one-to-one call overlap", () => {
  assert.match(server, /call\.participants\.size >= 8/);
  assert.match(server, /End your one-to-one call before joining a group call/);
});

test("SDP and ICE signaling is relayed only between participants in the same active call", () => {
  assert.match(server, /\["group-call:offer", "group-call:answer", "group-call:ice-candidate"\]/);
  assert.match(server, /!call\.participants\.has\(senderId\)/);
  assert.match(server, /!call\.participants\.has\(targetUserId\)/);
  assert.match(server, /io\.to\(\`user:\$\{targetUserId\}\`\)\.emit\(eventName/);
});

test("only the host can end a conference for everyone and disconnects clean up membership", () => {
  assert.match(server, /socket\.on\("group-call:end"/);
  assert.match(server, /call\.hostId !== String\(socket\.data\.userId\)/);
  assert.match(server, /Array.from\(groupCallMembership\).*leaveGroupCall/);
  assert.match(server, /socket\.on\("group-call:leave"/);
});
