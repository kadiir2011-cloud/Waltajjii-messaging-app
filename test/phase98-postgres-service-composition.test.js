"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresRuntimeServices } = require("../src/postgres/postgres-runtime-services");

function dependencies(overrides = {}) {
  const db = {
    one: async () => null,
    many: async () => [],
    execute: async () => 0,
    withTransaction: async work => work({
      one: async () => null, many: async () => [], execute: async () => 0
    })
  };
  const bcrypt = { hash: async value => "hash:" + value, compare: async () => true };
  const jwt = { sign: () => "token", verify: () => ({ userId: "1", username: "member" }) };
  const storageClient = { from: bucket => ({ bucket }) };
  return { db, bcrypt, jwt, jwtSecret: "x".repeat(40), storageClient, ...overrides };
}

test("builds the complete PostgreSQL service graph from injected dependencies", () => {
  const result = createPostgresRuntimeServices(dependencies());
  assert.deepEqual(Object.keys(result.services).sort(), [
    "auth", "channels", "governance", "groups", "messages", "moments", "realtime", "social"
  ]);
  for (const [name, methods] of Object.entries({
    auth: ["register", "login", "getProfile", "updateProfile"],
    messages: ["listUsers", "sendMessage", "getConversation", "markConversationRead", "deleteMessage", "editMessage", "forwardMessage", "toggleReaction"],
    groups: ["createGroup", "listGroups", "listMembers", "addMember", "getMessages", "sendMessage", "markDelivered", "toggleReaction", "editMessage", "deleteMessage", "pinMessage"],
    governance: ["changeRole", "leave", "removeMember", "updateDetails", "getDetails", "listActivity", "createInvitation", "listInvitations", "revokeInvitation", "previewInvitation", "joinByInvitation", "listJoinRequests", "reviewJoinRequest", "listPolls", "createPoll", "votePoll", "closePoll", "listEvents", "createEvent", "rsvp", "cancelEvent"],
    channels: ["listChannels", "createChannel", "joinChannel", "listMembers", "addMember", "removeMember", "getMessages", "publishMessage", "markDelivered", "markRead", "toggleReaction", "editMessage", "deleteMessage", "pinMessage", "leaveChannel"],
    social: ["discover", "follow", "unfollow", "connect", "listRequests", "respondRequest", "followers", "following", "feed", "createPost", "toggleLike", "listComments", "createComment", "listNotifications", "markNotificationsRead"],
    moments: ["cleanupExpired", "listVisible", "create", "getVisibleMedia", "deleteOwn"],
    realtime: ["getOnlineProfiles", "listGroupIdsForUser", "isGroupMember", "markMessageDelivered"]
  })) {
    for (const method of methods) assert.equal(typeof result.services[name][method], "function", name + "." + method);
  }
  for (const method of ["upload", "removeOwned", "removeById", "downloadOwned", "downloadForViewer", "removeIfUnreferenced", "processCleanupQueue"]) {
    assert.equal(typeof result.mediaStorage[method], "function", "mediaStorage." + method);
  }
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.services));
});

test("allows an explicit non-default media bucket and deterministic governance clock", () => {
  const result = createPostgresRuntimeServices(dependencies({
    mediaBucket: "waltajjii-staging-media",
    clock: () => new Date("2026-11-15T00:00:00.000Z")
  }));
  assert.equal(typeof result.services.governance.createEvent, "function");
  assert.equal(typeof result.mediaStorage.upload, "function");
});

test("rejects missing or weak runtime dependencies before constructing services", () => {
  assert.throws(() => createPostgresRuntimeServices({}), /PostgreSQL adapter/);
  assert.throws(() => createPostgresRuntimeServices(dependencies({ jwtSecret: "short" })), /at least 32 characters/);
  assert.throws(() => createPostgresRuntimeServices(dependencies({ storageClient: null })), /private Supabase Storage client/);
  assert.throws(() => createPostgresRuntimeServices(dependencies({ bcrypt: null })), /bcrypt-compatible/);
  assert.throws(() => createPostgresRuntimeServices(dependencies({ jwt: { sign() {} } })), /sign\(\) and verify\(\)/);
  assert.throws(() => createPostgresRuntimeServices(dependencies({ clock: "not-a-function" })), /clock must be a function/);
});
