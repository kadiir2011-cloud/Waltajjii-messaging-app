"use strict";

const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const AUDIO_TYPES = Object.freeze({
  "audio/webm": true,
  "audio/ogg": true,
  "audio/mp4": true,
  "audio/mpeg": true,
  "audio/mp3": true,
  "audio/wav": true,
  "audio/x-wav": true,
  "audio/flac": true,
  "audio/mp4a-latm": true,
  "video/webm": true
});
const LANGUAGES = Object.freeze(["en", "am", "om", "ti", "so", "ar", "sw", "fr", "de", "es", "it", "pt"]);

function createPostgresAudioIntelligenceRouter({
  jwtSecret,
  jwtImplementation = jwt,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
  fetchImpl = globalThis.fetch,
  limiter
} = {}) {
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) throw new TypeError("A strong JWT secret is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 1 },
    fileFilter: (req, file, cb) => {
      const mime = String(file.mimetype || "").split(";")[0].toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(AUDIO_TYPES, mime)) return cb(new Error("Unsupported audio format. Use WebM, OGG, MP3, MP4/M4A, WAV or FLAC."));
      cb(null, true);
    }
  });
  const requestLimit = limiter || rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 4,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Voice transcription limit reached. Please wait before trying again." }
  });

  router.post("/transcribe", requestLimit, (req, res) => {
    upload.single("audio")(req, res, async error => {
      if (error) {
        const message = error.code === "LIMIT_FILE_SIZE"
          ? "Audio file is too large. Maximum size is 15 MB."
          : error.message || "Audio upload failed.";
        return res.status(400).json({ error: message });
      }

      const [scheme, token] = String(req.headers.authorization || "").split(" ");
      if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Please log in to transcribe audio." });
      try {
        const claims = jwtImplementation.verify(token, jwtSecret, { issuer: "waltajjii", audience: "waltajjii-users" });
        if (!claims?.userId) return res.status(401).json({ error: "Your session has expired. Please log in again." });
      } catch {
        return res.status(401).json({ error: "Your session has expired. Please log in again." });
      }

      if (!req.file || !req.file.buffer?.length) return res.status(400).json({ error: "Choose a voice recording first." });
      if (!apiKey) return res.status(503).json({ error: "Voice transcription is not configured. An administrator must configure its API key securely." });

      const language = typeof req.body?.language === "string" ? req.body.language : "";
      if (language && !LANGUAGES.includes(language)) return res.status(400).json({ error: "Choose a supported spoken-language hint or leave it on auto-detect." });

      try {
        const form = new FormData();
        form.append("file", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || "voice-message.webm");
        form.append("model", model);
        form.append("response_format", "json");
        if (language) form.append("language", language);

        const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: "Bearer " + apiKey },
          body: form,
          signal: AbortSignal.timeout(60000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error("Waltajjii transcription provider returned HTTP " + response.status);
          return res.status(502).json({ error: "Voice transcription could not be completed. Please try again." });
        }
        const transcript = typeof payload.text === "string" ? payload.text.trim() : "";
        if (!transcript) return res.status(502).json({ error: "No speech was detected in this recording." });
        res.set("Cache-Control", "no-store");
        res.set("X-Content-Type-Options", "nosniff");
        return res.json({ transcript, language: language || null });
      } catch (failure) {
        console.error("Waltajjii transcription request failed:", failure?.name || "Error");
        return res.status(504).json({ error: "Voice transcription timed out or is temporarily unavailable." });
      }
    });
  });

  return router;
}

module.exports = { createPostgresAudioIntelligenceRouter, AUDIO_TRANSCRIPTION_LANGUAGES: LANGUAGES };
