"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
const accessToken = fs.readFileSync(path.join(root, "src/security/access-token.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");

test("core HTTP route modules are mounted", () => {
  for (const route of ["auth", "messages", "groups", "channels", "uploads", "social", "moments", "calls"]) {
    assert.ok(server.includes('require("./routes/' + route + '")'), "missing route module: " + route);
  }
  assert.match(server, /app\.get\(["']\/health["']/);
});

test("HTTP boundary has security headers, origin validation, bounded JSON and rate limiting", () => {
  assert.match(server, /app\.use\(helmet\(/);
  assert.match(server, /createOriginPolicy\(process\.env\)/);
  assert.match(server, /isAllowedRequestOrigin\(origin, req\.get\("host"\)\)/);
  assert.match(server, /express\.json\(\{\s*limit:\s*"20kb"\s*\}\)/);
  assert.match(server, /windowMs:\s*15\s*\*\s*60\s*\*\s*1000/);
});

test("Socket.IO requires a signed, scoped login token before accepting connections", () => {
  assert.match(server, /io\.use\(\(socket, next\) =>/);
  assert.match(server, /socket\.handshake\.auth\?\.token/);
  assert.match(accessToken, /issuer:\s*"waltajjii"/);
  assert.match(accessToken, /audience:\s*"waltajjii-users"/);
  assert.match(server, /verifyAccessToken\(token, db\)/);
  assert.match(server, /socket\.data\.userId\s*=\s*user\.userId/);
});

test("critical communication and call controls remain present in the client", () => {
  for (const id of [
    "wt-caption-target-language",
    "wt-caption-consent",
    "wt-caption-auto-translate",
    "wt-translation-from",
    "wt-translation-to",
    "wt-ai-language",
    "wt-audio-translate-language"
  ]) {
    assert.ok(html.includes('id="' + id + '"'), "missing client control: " + id);
  }
  assert.match(appJs, /getDisplayMedia/);
  assert.match(appJs, /RTCPeerConnection/);
});

test("translation endpoint requires authentication, validates input and prevents caching", () => {
  assert.match(server, /app\.post\(["']\/api\/translation\/translate["']/);
  assert.match(server, /scheme !== "Bearer"/);
  assert.match(server, /verifyAccessToken\(accessToken, db\)/);
  assert.match(server, /text\.length > 4000/);
  assert.match(server, /res\.set\("Cache-Control", "no-store"\)/);
});

test("the application keeps explicit privacy consent and opt-in defaults", () => {
  assert.match(html, /id="wt-caption-consent"[^>]*>/);
  assert.match(html, /id="wt-caption-auto-translate"[^>]*>/);
  assert.match(html, /id="wt-caption-share"[^>]*>/);
  assert.match(html, /id="wt-ai-consent"[^>]*>/);
  assert.match(html, /id="wt-audio-consent"[^>]*>/);
});
