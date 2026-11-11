"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createOriginPolicy, parseOrigin } = require("../src/security/origin-policy");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Phase 63: explicit configured origins are normalized and allowed", () => {
  const policy = createOriginPolicy({
    NODE_ENV: "production",
    CLIENT_URL: "https://waltajjii.example/",
    PUBLIC_APP_URL: "https://www.waltajjii.example",
    WALTAJJII_ALLOWED_ORIGINS: "https://admin.waltajjii.example, https://test.waltajjii.example"
  });
  assert.equal(policy.isAllowedOrigin("https://waltajjii.example"), true);
  assert.equal(policy.isAllowedOrigin("https://admin.waltajjii.example"), true);
  assert.equal(policy.isAllowedOrigin("https://test.waltajjii.example"), true);
  assert.equal(policy.isAllowedOrigin("https://attacker.example"), false);
  assert.equal(policy.allowedOrigins.length, 4);
});

test("Phase 63: same-host requests and non-browser clients work without opening cross-origin access", () => {
  const policy = createOriginPolicy({ NODE_ENV: "production" });
  assert.equal(policy.isAllowedRequestOrigin(undefined, "waltajjii.onrender.com"), true);
  assert.equal(policy.isAllowedRequestOrigin("https://waltajjii.onrender.com", "waltajjii.onrender.com"), true);
  assert.equal(policy.isAllowedRequestOrigin("https://attacker.example", "waltajjii.onrender.com"), false);
});

test("Phase 63: malformed, non-HTTP and path-bearing origins are rejected", () => {
  assert.equal(parseOrigin("javascript:alert(1)"), null);
  assert.equal(parseOrigin("file:///etc/passwd"), null);
  assert.equal(parseOrigin("https://waltajjii.example/path"), null);
  assert.equal(parseOrigin("not-an-origin"), null);
  const policy = createOriginPolicy({ NODE_ENV: "production", CLIENT_URL: "https://waltajjii.example" });
  assert.equal(policy.isAllowedRequestOrigin("https://waltajjii.example/path", "waltajjii.example"), false);
});

test("Phase 63: local development origins are limited to the configured port", () => {
  const policy = createOriginPolicy({ NODE_ENV: "development", PORT: "4100" });
  assert.equal(policy.isAllowedOrigin("http://localhost:4100"), true);
  assert.equal(policy.isAllowedOrigin("http://127.0.0.1:4100"), true);
  assert.equal(policy.isAllowedOrigin("http://localhost:3000"), false);
});

test("Phase 63: Express and Socket.IO both enforce the shared origin policy", () => {
  const server = read("src/server.js");
  assert.match(server, /createOriginPolicy\(process\.env\)/);
  assert.match(server, /originPolicy\.isAllowedRequestOrigin\(origin, req\.get\("host"\)\)/);
  assert.match(server, /allowRequest:\s*\(request, callback\)/);
  assert.match(server, /originPolicy\.isAllowedRequestOrigin\(origin, requestHost\)/);
  assert.doesNotMatch(server, /app\.use\(cors\(\)\)/);
  assert.match(server, /credentials:\s*false/);
});

test("Phase 63: deleted direct-message attachments are no longer authorized for download", () => {
  const uploads = read("src/routes/uploads.js");
  assert.match(uploads, /WHERE media_path = \? AND deleted_at IS NULL\s+AND \(sender_id = \? OR receiver_id = \?\)/);
  assert.match(uploads, /Cache-Control", "private, no-store/);
  assert.match(uploads, /X-Content-Type-Options", "nosniff/);
});

test("Phase 63: browser rendering avoids unsafe HTML string injection sinks", () => {
  const app = read("public/app.js");
  assert.doesNotMatch(app, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new Function\s*\(/);
});

test("Phase 63: CSP and baseline security headers remain enabled", () => {
  const server = read("src/server.js");
  assert.match(server, /app\.use\(helmet\(/);
  assert.match(server, /contentSecurityPolicy:/);
  assert.match(server, /imgSrc:/);
  assert.match(server, /mediaSrc:/);
});
