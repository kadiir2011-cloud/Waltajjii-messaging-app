"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

test("Phase 108 keeps all key authenticated workspace controls and feature anchors", () => {
  for (const id of [
    "wt-communication-section", "recipient", "load-button", "call-panel",
    "messages", "message-form", "message-input", "media-input",
    "record-voice-button", "wt-language-bridge", "wt-social-section",
    "wt-groups-section", "wt-channels-section", "profile-panel",
    "personalization-panel", "logout-button"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
});

test("Phase 108 premium styling covers the in-app messaging workspace and composer", () => {
  assert.match(html, /Phase 108: premium in-app workspace/);
  for (const selector of [
    "#wt-communication-section", "#call-panel", "#messages",
    "#message-form", "#wt-language-bridge", ".social-tabs",
    ".group-message-form", ".personalization-panel", "#profile-panel"
  ]) assert.ok(html.includes(selector), "Missing style selector: " + selector);
});

test("Phase 108 preserves dark mode, responsive layouts, focus and reduced-motion accessibility", () => {
  assert.match(html, /body\[data-wt-theme="dark"\]/);
  assert.match(html, /@media\s*\(max-width:\s*820px\)/);
  assert.match(html, /@media\s*\(max-width:\s*560px\)/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-reduced-motion/);
});

test("Phase 108 is presentation-only and retains existing messaging and feature handlers", () => {
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /src="\/ai-assistant\.js"/);
  assert.match(app, /message-form/);
  assert.match(app, /load-button/);
  assert.match(app, /start-call-button/);
  assert.match(app, /loadGroups\(\)/);
  assert.match(app, /loadChannels\(\)/);
});
