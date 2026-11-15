"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const app = fs.readFileSync("public/app.js", "utf8");
const html = fs.readFileSync("public/index.html", "utf8");

assert.match(html, /id="wt-low-data"/, "Low-Bandwidth Mode control must exist");
assert.match(html, /Images, videos, voice messages and documents load only when you choose to open them\./,
  "The control must explain its effect");
assert.match(app, /lowData: false/, "Low-Bandwidth Mode must default to off");
assert.match(app, /lowDataSelect\.checked = prefs\.lowData === true/,
  "The saved preference must be restored");
assert.match(app, /lowData: lowDataSelect\.checked/,
  "The preference must be persisted");
assert.match(app, /function isLowDataMode\(\)/,
  "Media rendering must read the preference");
assert.equal((app.match(/createMediaLoadButton\(/g) || []).length, 5,
  "Voice, image, video and document paths must all have on-demand controls plus one helper definition");
assert.match(app, /Load voice message/);
assert.match(app, /Load image \(uses data\)/);
assert.match(app, /Load video \(uses data\)/);
assert.match(app, /Prepare document download/);
assert.match(html, /body\[data-wt-low-data="true"\]/,
  "Low-Bandwidth Mode must suppress nonessential motion");
console.log("Phase 8 low-bandwidth frontend contract: PASS");
