"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const socket = fs.readFileSync(path.join(__dirname, "../src/postgres/postgres-realtime-socket.js"), "utf8");

test("live caption UI explains browser speech processing and requires explicit opt-in", () => {
  assert.match(html, /browser's speech-recognition feature/i);
  assert.match(html, /audio may be processed by its speech service/i);
  assert.match(html, /id="wt-caption-consent"/);
  assert.match(app, /if \(!captionConsent\?\.checked\)/);
  assert.match(app, /SpeechRecognition \|\| window\.webkitSpeechRecognition/);
});

test("live captions are user-started and use a selected spoken language", () => {
  assert.match(html, /id="wt-caption-start"/);
  assert.match(html, /id="wt-caption-language"/);
  assert.match(app, /recognition\.continuous = true/);
  assert.match(app, /recognition\.lang = captionLanguage\?\.value/);
  assert.match(app, /recognition\.start\(\)/);
});

test("caption sharing is optional and only final transcript text is emitted", () => {
  assert.match(html, /id="wt-caption-share"/);
  assert.match(html, /Share my recognized caption text with the other caller \(off by default\)/);
  assert.match(app, /if \(captionShare\?\.checked && callSocket\?\.connected && activeCallUserId\)/);
  assert.match(app, /callSocket\.emit\("call:caption"/);
  assert.match(app, /if \(!result\.isFinal\) continue/);
});

test("captions are rendered as text, bounded in the UI and cleared when the call ends", () => {
  assert.match(app, /content\.textContent = text/);
  assert.match(app, /while \(captionFeed\.children\.length > 20\)/);
  assert.match(app, /stopLiveCallCaptions\(true\)/);
  assert.match(app, /String\(data\.senderId\) !== String\(activeCallUserId\)/);
});

test("translation is a manual action and is not broadcast to the other caller", () => {
  assert.match(html, /id="wt-caption-translate"/);
  assert.match(app, /api\("\/api\/translation\/translate"/);
  assert.match(app, /captionTranslation\.textContent = result\.translation/);
  const translateFunction = app.slice(app.indexOf("async function translateLatestCallCaption"), app.indexOf("let peerConnection = null;"));
  assert.equal(translateFunction.includes('callSocket.emit("call:caption"'), false);
});

test("server relays captions only inside an active authenticated call and applies limits", () => {
  assert.match(socket, /socket\.on\("call:caption"/);
  assert.match(socket, /activeCalls\.get\(userId\) !== target/);
  assert.match(socket, /caption\.length > 500/);
  assert.match(socket, /count >= 20/);
  assert.match(socket, /senderUsername: socket\.data\.username/);
  assert.match(socket, /emitToUser\(target, "call:caption"/);
  assert.doesNotMatch(socket, /INSERT INTO .*caption|caption.*INSERT INTO/i);
});
