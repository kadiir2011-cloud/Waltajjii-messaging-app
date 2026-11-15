"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const assistant = fs.readFileSync(path.join(__dirname, "../public/ai-assistant.js"), "utf8");

test("AI panel discloses provider processing and requires explicit consent", () => {
  assert.ok(html.includes('id="wt-ai-panel"'));
  assert.match(html, /only the text shown below is sent to the configured AI provider/i);
  assert.ok(html.includes('id="wt-ai-consent"'));
  assert.match(assistant, /if \(!consentInput\.checked\)/);
});
test("AI panel offers the three supported user-invoked actions", () => {
  for (const action of ["summarize", "suggest_reply", "extract_tasks"]) assert.ok(html.includes('value="' + action + '"'));
  assert.ok(assistant.includes('api("/api/ai/assist"'));
});
test("Ask AI passes only the selected message body and caps context", () => {
  assert.ok(app.includes("waltajjii:ai-context"));
  assert.ok(app.includes("item.body.slice(0, 8000)"));
  assert.ok(assistant.includes("selected.slice(0, 8000)"));
});
test("AI output is rendered as text, not HTML", () => {
  assert.ok(assistant.includes("result.textContent = data.result"));
  assert.ok(!assistant.includes("result.innerHTML"));
});
test("using an AI suggestion only fills the composer and never submits it", () => {
  assert.ok(assistant.includes("composer.value = draft.slice(0, 2000)"));
  assert.ok(assistant.includes("press Send yourself when ready"));
  assert.ok(!assistant.includes("messageForm.requestSubmit"));
  assert.ok(!assistant.includes('api("/api/messages/'));
});
test("assistant UI script loads after the authenticated app script", () => {
  const appIndex = html.indexOf('<script src="/app.js" defer>');
  const assistantIndex = html.indexOf('<script src="/ai-assistant.js" defer>');
  assert.ok(appIndex >= 0 && assistantIndex > appIndex);
});