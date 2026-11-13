"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

test("screen sharing controls disclose sharing and provide a local preview", () => {
  assert.match(html, /id="wt-screen-share"/);
  assert.match(html, /id="wt-screen-share-stop"/);
  assert.match(html, /id="wt-screen-share-status" role="status"/);
  assert.match(html, /id="wt-screen-share-preview-container" hidden/);
  assert.match(html, /id="wt-screen-share-preview"/);
});

test("screen sharing requires an established video call and explicit browser capture permission", () => {
  assert.match(app, /peerConnection\.connectionState !== "connected"/);
  assert.match(app, /navigator\.mediaDevices\?\.getDisplayMedia/);
  assert.match(app, /getDisplayMedia\(\{/);
  assert.match(app, /audio: false/);
  assert.match(app, /sender\.replaceTrack\(screenTrack\)/);
});

test("only the outgoing video sender is replaced; camera is restored on stop", () => {
  assert.match(app, /getSenders\(\)\.find\(item => item\.track\?\.kind === "video"\)/);
  assert.match(app, /screenShareCameraTrack = cameraTrack/);
  assert.match(app, /sender\.replaceTrack\(cameraTrack\?\.readyState === "live" \? cameraTrack : null\)/);
  assert.match(app, /screenShareButton\.addEventListener\("click", startScreenSharing\)/);
  assert.match(app, /stopScreenShareButton\.addEventListener\("click", \(\) => stopScreenSharing\(true\)\)/);
});

test("browser stop and call teardown release captured tracks and clear preview state", () => {
  assert.match(app, /screenTrack\.addEventListener\("ended", \(\) => \{ stopScreenSharing\(true\); \}/);
  assert.match(app, /capture\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(app, /stopScreenSharing\(false\)/);
  assert.match(app, /screenSharePreview\.srcObject = null/);
  assert.match(app, /screenSharePreviewContainer\.hidden = true/);
});
