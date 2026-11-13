"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const expandedLanguages = ["Afaan Oromo","Amharic","Tigrinya","Somali","Afar","Sidama","Wolaytta","Gamo","Gofa","Dawro","Hadiyya","Kafa","Gedeo","Kambaata","Silt'e","Sebat Bet Gurage","Bench","Shekkacho","Gumuz","Nuer","Anuak","Berta","Me'en","Konso","English","Arabic"];

test("caption translation exposes expanded Ethiopian language choices accepted by the API", () => {
  const match = html.match(/<select id="wt-caption-target-language">([\\s\\S]*?)<\\/select>/);
  assert.ok(match, "caption translation selector exists");
  for (const language of expandedLanguages) {
    assert.ok(match[1].includes(">" + language + "</option>"), "missing caption language: " + language);
    assert.ok(server.includes(JSON.stringify(language)), "server does not allow caption language: " + language);
  }
});

test("other translation tools share the expanded language choices", () => {
  for (const id of ["wt-translation-from", "wt-translation-to", "wt-ai-language", "wt-audio-translate-language"]) {
    const match = html.match(new RegExp("<select id=\"" + id + "\">([\\s\\S]*?)<\\/select>"));
    assert.ok(match, "missing selector " + id);
    for (const language of expandedLanguages) assert.ok(match[1].includes(">" + language + "</option>"), id + " missing " + language);
  }
});

test("caption translation remains opt-in and output remains local", () => {
  assert.match(html, /id="wt-caption-auto-translate"/);
  assert.match(html, /shown only on your device/);
  assert.match(server, /Cache-Control", "no-store"/);
});
