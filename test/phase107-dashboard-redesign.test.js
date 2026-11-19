"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

test("Phase 107 dashboard includes the six existing product workspaces", () => {
  for (const id of [
    "wt-communication-section",
    "wt-social-section",
    "wt-groups-section",
    "wt-channels-section",
    "profile-panel",
    "personalization-panel"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
});

test("Phase 107 dashboard shortcuts target real workspace sections", () => {
  const links = [...html.matchAll(/class="[^"]*wt-home-action[^"]*" href="#([^"]+)"/g)].map(m => m[1]);
  assert.equal(links.length, 6);
  for (const id of links) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(app, /\.wt-home-action\[href\^="#"/);
});

test("Phase 107 responsive workspace styles include desktop, tablet and mobile layouts", () => {
  assert.match(html, /\.wt-dashboard-hero/);
  assert.match(html, /\.wt-dashboard-grid/);
  assert.match(html, /@media\s*\(max-width:\s*820px\)/);
  assert.match(html, /@media\s*\(max-width:\s*560px\)/);
  assert.match(html, /prefers-reduced-motion/);
});

test("Phase 107 keeps the existing application script and backend integration entry points", () => {
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /src="\/ai-assistant\.js"/);
  assert.match(app, /function showChat\(/);
  assert.match(app, /loadUsers\(\)/);
  assert.match(app, /loadGroups\(\)/);
  assert.match(app, /loadChannels\(\)/);
});
