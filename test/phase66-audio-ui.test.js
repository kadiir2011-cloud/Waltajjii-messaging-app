"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const audio = fs.readFileSync(path.join(__dirname, "../public/audio-intelligence.js"), "utf8");

test("voice message offers explicit, user-triggered transcription", () => {
  assert.match(app, /Transcribe voice/);
  assert.match(app, /waltajjii:audio-context/);
  assert.match(app, /fetch\(mediaUrl/);
});
test("audio panel discloses provider processing and requires separate consent", () => {
  assert.match(html, /Only the audio you select is sent to the configured provider after you consent/i);
  assert.match(html, /id="wt-audio-consent"/);
  assert.match(audio, /if \(!consent\.checked\)/);
});
test("audio is uploaded only after user action and is size limited", () => {
  assert.match(audio, /15 \* 1024 \* 1024/);
  assert.match(audio, /fetch\("\/api\/audio\/transcribe"/);
  assert.match(audio, /method: "POST"/);
});
test("transcript translation uses the existing authenticated translation endpoint", () => {
  assert.match(audio, /api\("\/api\/translation\/translate"/);
  assert.match(html, /id="wt-audio-translate-language"/);
});
test("transcript is rendered as text and never auto-sent", () => {
  assert.match(audio, /translationOutput\.textContent = data\.translation/);
  assert.match(audio, /composer\.value = draft\.slice\(0, 2000\)/);
  assert.match(audio, /press Send yourself/);
  assert.doesNotMatch(audio, /messageForm\.requestSubmit|messageForm\.submit\(/);
});
test("voice intelligence script is loaded after the main and AI scripts", () => {
  const main = html.indexOf('<script src="/app.js" defer>');
  const ai = html.indexOf('<script src="/ai-assistant.js" defer>');
  const audioScript = html.indexOf('<script src="/audio-intelligence.js" defer>');
  assert.ok(main >= 0 && ai > main && audioScript > ai);
});
