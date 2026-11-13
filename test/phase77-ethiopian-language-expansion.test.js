"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const expandedLanguages = ["Afaan Oromo","Amharic","Tigrinya","Somali","Afar","Sidama","Wolaytta","Gamo","Gofa","Dawro","Hadiyya","Kafa","Gedeo","Kambaata","Silt'e","Sebat Bet Gurage","Bench","Shekkacho","Gumuz","Nuer","Anuak","Berta","Me'en","Konso","English","Arabic","French","Spanish","Portuguese","German","Italian","Dutch","Russian","Ukrainian","Polish","Turkish","Persian (Farsi)","Hebrew","Urdu","Hindi","Bengali","Punjabi","Gujarati","Marathi","Tamil","Telugu","Kannada","Malayalam","Sinhala","Nepali","Chinese (Simplified)","Chinese (Traditional)","Japanese","Korean","Thai","Vietnamese","Indonesian","Malay","Filipino (Tagalog)","Burmese","Khmer","Lao","Mongolian","Kazakh","Uzbek","Azerbaijani","Greek","Swedish","Norwegian","Danish","Finnish","Romanian","Hungarian","Czech","Slovak","Croatian","Serbian","Bosnian","Bulgarian","Albanian","Armenian","Georgian","Pashto","Kurdish","Dari","Swahili","Hausa","Yoruba","Igbo","Zulu","Xhosa","Afrikaans","Kinyarwanda","Kirundi","Lingala","Shona","Sesotho","Setswana","Malagasy","Somali (Latin)","Icelandic","Irish","Welsh","Catalan","Basque","Galician","Estonian","Latvian","Lithuanian","Belarusian","Macedonian","Maltese","Luxembourgish","Tajik","Turkmen","Uyghur","Javanese","Sundanese"];
function selector(id) {
  const start = html.indexOf('<select id="' + id + '">');
  assert.notEqual(start, -1, "missing selector " + id);
  const end = html.indexOf("</select>", start);
  assert.notEqual(end, -1, "unclosed selector " + id);
  return html.slice(start, end);
}

test("caption translation exposes Ethiopian and major international languages accepted by the API", () => {
  const caption = selector("wt-caption-target-language");
  for (const language of expandedLanguages) {
    assert.ok(caption.includes(">" + language + "</option>"), "missing caption language: " + language);
    assert.ok(server.includes(JSON.stringify(language)), "server does not allow caption language: " + language);
  }
});

test("all translation tools share the expanded Ethiopian and international language choices", () => {
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
