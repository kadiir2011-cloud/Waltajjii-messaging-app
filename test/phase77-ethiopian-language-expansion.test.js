"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const expandedLanguages = ["Afaan Oromo","Amharic","Tigrinya","Somali","Afar","Sidama","Wolaytta","Gamo","Gofa","Dawro","Hadiyya","Kafa","Gedeo","Kambaata","Silt'e","Sebat Bet Gurage","Bench","Shekkacho","Gumuz","Nuer","Anuak","Berta","Me'en","Konso","English","Arabic"];
function selector(id) {
  const start = html.indexOf('<select id="' + id + '">');
  assert.notEqual(start, -1, "missing selector " + id);
  const end = html.indexOf("</select>", start);
  assert.notEqual(end, -1, "unclosed selector " + id);
  return html.slice(start, end);
}

test("caption translation exposes expanded Ethiopian language choices accepted by the API", () => {
  const caption = selector("wt-caption-target-language");
  for (const language of expandedLanguages) {
    assert.ok(caption.includes(">" + language + "</option>"), "missing caption language: " + language);
    assert.ok(server.includes(JSON.stringify(language)), "server does not allow caption language: " + language);
  }
});

test("other translation tools share the expanded language choices", () => {
  for (const id of ["wt-translation-from", "wt-translation-to", "wt-ai-language", "wt-audio-translate-language"]) {
    const content = selector(id);
    for (const language of expandedLanguages) assert.ok(content.includes(">" + language + "</option>"), id + " missing " + language);
  }
});

test("caption translation remains opt-in and output remains local", () => {
  assert.match(html, /id="wt-caption-auto-translate"/);
  assert.match(html, /shown only on your device/);
  assert.match(server, /Cache-Control", "no-store"/);
});
