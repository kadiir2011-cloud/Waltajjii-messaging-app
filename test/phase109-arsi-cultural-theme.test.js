"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

test("Phase 109 defines the Arsi-inspired palette and application-wide backdrop", () => {
  for (const token of [
    "--arsi-ink", "--arsi-charcoal", "--arsi-red", "--arsi-red-deep",
    "--arsi-leather", "--arsi-ivory", "--arsi-white", "--arsi-green",
    "Phase 109: Arsi cultural color system", "body::before"
  ]) assert.ok(html.includes(token), "Missing Arsi theme token: " + token);
});

test("Phase 109 applies the palette to every main workspace, not only video calls", () => {
  for (const selector of [
    "body > header", "#chat-panel", ".wt-sidebar", ".wt-main-content",
    ".wt-online-people", ".wt-home-placeholder", ".wt-dashboard-hero",
    ".wt-dashboard-card", "#wt-communication-section", "#messages",
    "#message-form", "#call-panel", "#wt-social-section",
    "#wt-groups-section", "#wt-channels-section",
    ".social-panel", ".group-panel", "#profile-panel",
    "#profile-hero", ".personalization-panel", ".wt-language-bridge"
  ]) assert.ok(html.includes(selector), "Missing themed area: " + selector);
});

test("Phase 109 retains light and dark palette treatments and responsive behavior", () => {
  assert.match(html, /body\[data-wt-theme="dark"\]/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /@media\(max-width:560px\)/);
  assert.match(html, /:focus-visible/);
});

test("Phase 109 does not replace application JavaScript or remove existing feature anchors", () => {
  for (const id of [
    "wt-communication-section", "call-panel", "messages", "message-form",
    "wt-social-section", "wt-groups-section", "wt-channels-section",
    "profile-panel", "personalization-panel", "logout-button"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /src="\/app\.js"/);
});
