"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const routeSet = file => {
  const source = read(file);
  return new Set([...source.matchAll(/router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)]
    .map(match => match[1].toUpperCase() + " " + match[2]));
};

test("browser API helper preserves bearer-token and JSON request contract", () => {
  const app = read("public/app.js");
  assert.match(app, /async function api\(path, options = \{\}\)/);
  assert.match(app, /headers\.Authorization = "Bearer " \+ token/);
  assert.match(app, /headers\["Content-Type"\] = "application\/json"/);
  assert.match(app, /fetch\(path, \{ \.\.\.options, headers \}\)/);
  assert.match(app, /if \(!response\.ok\)[\s\S]{0,180}throw new Error\(data\.error/);
});

test("browser client retains the principal API families and known advanced flows", () => {
  const app = read("public/app.js");
  for (const fragment of [
    "/api/auth/login", "/api/auth/register", "/api/auth/profile",
    "/api/messages/users", "/api/messages/conversation/",
    "/api/groups", "/api/channels", "/api/social/feed",
    "/api/social/discover", "/api/moments", "/api/presence/online",
    "/api/calls/turn-credentials", "/api/translation/translate",
    "/api/groups/", "/invitations", "/join-requests", "/polls", "/events",
    "/api/uploads/profile-picture"
  ]) assert.ok(app.includes(fragment), "Missing browser API contract: " + fragment);
});

test("PostgreSQL route modules expose their established core contracts", () => {
  const contracts = {
    "src/routes/postgres-auth.js": [
      "POST /register", "POST /login", "GET /profile", "PATCH /profile"
    ],
    "src/routes/postgres-messages.js": [
      "GET /users", "POST /", "GET /conversation/:username",
      "POST /conversation/:username/read", "DELETE /:messageId/delete",
      "PATCH /:messageId/edit", "POST /:messageId/forward",
      "POST /:messageId/reactions"
    ],
    "src/routes/postgres-groups.js": [
      "GET /", "POST /", "GET /:id/members", "POST /:id/members",
      "GET /:id/messages", "POST /:id/messages",
      "POST /:id/messages/:messageId/delivered",
      "POST /:id/messages/:messageId/reactions",
      "PATCH /:id/messages/:messageId", "DELETE /:id/messages/:messageId"
    ],
    "src/routes/postgres-group-governance.js": [
      "GET /invitation/:token", "POST /invitation/:token/join",
      "PATCH /:id/members/:userId/role", "DELETE /:id/leave",
      "GET /:id/details", "PATCH /:id/details", "GET /:id/activity",
      "POST /:id/invitations", "GET /:id/invitations",
      "DELETE /:id/invitations/:invitationId", "GET /:id/join-requests",
      "POST /:id/join-requests/:requestId/review", "GET /:id/polls",
      "POST /:id/polls", "PUT /:id/polls/:pollId/vote",
      "POST /:id/polls/:pollId/close", "GET /:id/events",
      "POST /:id/events", "PUT /:id/events/:eventId/rsvp",
      "POST /:id/events/:eventId/cancel"
    ],
    "src/routes/postgres-channels.js": [
      "GET /", "POST /", "POST /:id/join", "GET /:id/members",
      "POST /:id/members", "DELETE /:id/members/:userId",
      "GET /:id/messages", "POST /:id/messages", "DELETE /:id/leave"
    ],
    "src/routes/postgres-social.js": [
      "GET /discover", "POST /follow/:userId", "DELETE /follow/:userId",
      "POST /connect/:userId", "GET /requests",
      "POST /requests/:requestId/respond", "GET /followers",
      "GET /following", "GET /feed", "POST /posts",
      "POST /posts/:postId/like", "GET /posts/:postId/comments",
      "POST /posts/:postId/comments", "GET /notifications",
      "POST /notifications/read"
    ],
    "src/routes/postgres-moments.js": [
      "GET /", "POST /", "GET /media/:momentId", "DELETE /:momentId"
    ],
    "src/routes/postgres-presence.js": ["GET /online"]
  };

  for (const [file, expected] of Object.entries(contracts)) {
    const actual = routeSet(file);
    for (const route of expected) {
      assert.ok(actual.has(route), file + " is missing " + route);
    }
  }
});

test("Phase 56 audit does not switch the production SQLite runtime", () => {
  const server = read("src/server.js");
  assert.match(server, /require\("\.\/routes\/auth"\)/);
  assert.match(server, /require\("\.\/routes\/messages"\)/);
  assert.match(server, /require\("\.\/routes\/groups"\)/);
  assert.match(server, /require\("\.\/routes\/uploads"\)/);
  assert.doesNotMatch(server, /postgres-(?:auth|messages|groups|group-governance|channels|social|moments|presence)/);
});

test("known frontend integration gaps are explicit and test-visible", () => {
  const audit = read("PHASE-56-API-FRONTEND-COMPATIBILITY.md");
  for (const phrase of [
    "opt-in injected router",
    "Uploads/profile pictures",
    "Calls/TURN credentials",
    "Group invitation QR",
    "reminder worker",
    "static contract guards, not full browser E2E tests"
  ]) assert.ok(audit.includes(phrase), "Audit must retain explicit gap: " + phrase);
});
