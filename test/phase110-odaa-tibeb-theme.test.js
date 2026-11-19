"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const tree = fs.readFileSync(path.join(__dirname, "../public/odaa-canopy.svg"), "utf8");

test("Phase 110 adds a distinct Odaa and Tibeb Oromo-inspired design system", () => {
  for (const token of [
    "Phase 110 — Odaa & Tibeb", "--oromo-forest", "--oromo-red",
    "--oromo-charcoal", "--oromo-cloth", "--oromo-gold",
    "repeating-linear-gradient", "odaa-canopy.svg"
  ]) assert.ok(html.includes(token), "Missing design element: " + token);
  assert.match(tree, /<svg/);
  assert.match(tree, /linearGradient/);
  assert.match(tree, /viewBox="0 0 640 520"/);
});

test("Phase 110 applies the Oromo identity across app surfaces, not only calls", () => {
  for (const selector of [
    "body > header", "#auth-panel", ".wt-sidebar", ".wt-main-content",
    ".wt-dashboard-hero", ".wt-dashboard-card", ".wt-online-people",
    "#wt-communication-section", "#messages", "#message-form", "#call-panel",
    "#wt-social-section", "#wt-groups-section", "#wt-channels-section",
    "#profile-hero", ".personalization-panel", ".wt-language-bridge", "footer"
  ]) assert.ok(html.includes(selector), "Missing themed surface: " + selector);
});

test("Phase 110 preserves light and dark themes, responsive rules and original app handlers", () => {
  assert.match(html, /body\[data-wt-theme="dark"\]/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /@media\(max-width:560px\)/);
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /src="\/ai-assistant\.js"/);
  for (const id of ["recipient","load-button","call-panel","messages","message-form","wt-social-section","wt-groups-section","wt-channels-section","profile-panel","logout-button"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});
