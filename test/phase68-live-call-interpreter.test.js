"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

test("live interpreter is opt-in and discloses translation-provider processing", () => {
  assert.match(html, /id="wt-caption-auto-translate"/);
  assert.match(html, /Automatically translate captions received from the other caller \(off by default\)/);
  assert.match(html, /sent as text to the configured translation service/i);
  assert.match(app, /if \(!captionAutoTranslate\?\.checked \|\| !text \|\| !peerId\) return/);
});

test("only authenticated incoming call captions trigger automatic translation", () => {
  const handlerStart = app.indexOf('socket.on("call:caption"');
  const handlerEnd = app.indexOf('socket.on("call:ended"', handlerStart);
  const handler = app.slice(handlerStart, handlerEnd);
  assert.match(handler, /String\(data\.senderId\) !== String\(activeCallUserId\)/);
  assert.match(handler, /translateIncomingCallCaption\(data\.text\.slice\(0, 500\), data\.senderId\)/);
  assert.match(app, /api\("\/api\/translation\/translate"/);
  assert.match(app, /sourceLanguage: "Auto-detect"/);
});

test("automatic translation has per-call, cooldown and single-flight cost controls", () => {
  assert.match(app, /autoCaptionTranslationCount >= 30/);
  assert.match(app, /now - autoCaptionLastRequestAt < 1500/);
  assert.match(app, /autoCaptionTranslationPending/);
  assert.match(html, /limited to 30 captions per call and at most one request every 1\.5 seconds/i);
  assert.match(html, /skipped captions are not queued/i);
});

test("translation result stays local, uses safe text rendering and ignores stale call responses", () => {
  assert.match(app, /captionAutoTranslation\.textContent = result\.translation/);
  assert.match(app, /String\(activeCallUserId\) === String\(peerId\)/);
  assert.doesNotMatch(app, /captionAutoTranslation\.innerHTML/);
});

test("manual translation remains separate and call end clears interpreter state", () => {
  assert.match(app, /if \(captionAutoTranslate\) captionAutoTranslate\.checked = false/);
  assert.match(app, /autoCaptionTranslationCount = 0/);
  assert.match(app, /if \(captionAutoTranslation\) captionAutoTranslation\.textContent = ""/);
  assert.match(app, /async function translateLatestCallCaption/);
});
