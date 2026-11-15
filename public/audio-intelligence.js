"use strict";
(function initWaltajjiiAudioIntelligence() {
  const fileInput = document.getElementById("wt-audio-file");
  const fileName = document.getElementById("wt-audio-file-name");
  const languageInput = document.getElementById("wt-audio-language");
  const targetLanguage = document.getElementById("wt-audio-translate-language");
  const consent = document.getElementById("wt-audio-consent");
  const transcribeButton = document.getElementById("wt-audio-transcribe");
  const translateButton = document.getElementById("wt-audio-translate");
  const transcriptInput = document.getElementById("wt-audio-transcript");
  const translationOutput = document.getElementById("wt-audio-translation");
  const useButton = document.getElementById("wt-audio-use");
  const copyButton = document.getElementById("wt-audio-copy");
  const status = document.getElementById("wt-audio-status");
  if (!fileInput || !transcribeButton) return;

  let selectedAudio = null;
  const maxBytes = 15 * 1024 * 1024;

  function setStatus(message) { status.textContent = message; }
  function setAudio(file) {
    selectedAudio = file || null;
    fileName.textContent = selectedAudio
      ? selectedAudio.name + " (" + (selectedAudio.size / 1024 / 1024).toFixed(1) + " MB)"
      : "No audio selected.";
    consent.checked = false;
    transcriptInput.value = "";
    translationOutput.textContent = "";
    setStatus(selectedAudio ? "Review the privacy notice and confirm before transcription." : "Select audio and confirm consent.");
  }

  fileInput.addEventListener("change", () => setAudio(fileInput.files?.[0] || null));

  document.addEventListener("waltajjii:audio-context", event => {
    const blob = event.detail?.blob;
    if (!(blob instanceof Blob)) return;
    const filename = typeof event.detail.filename === "string" ? event.detail.filename : "voice-message.webm";
    setAudio(new File([blob], filename, { type: blob.type || "audio/webm" }));
    fileInput.value = "";
    document.getElementById("wt-audio-ai")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  transcribeButton.addEventListener("click", async () => {
    if (!selectedAudio) { setStatus("Choose an audio file or select Transcribe voice on a voice message."); return; }
    if (selectedAudio.size > maxBytes) { setStatus("Audio must be 15 MB or smaller."); return; }
    if (!consent.checked) { setStatus("Please confirm that this selected audio may be sent to the AI provider."); consent.focus(); return; }
    transcribeButton.disabled = true;
    setStatus("Transcribing selected audio…");
    try {
      const form = new FormData();
      form.append("audio", selectedAudio, selectedAudio.name || "voice-message.webm");
      if (languageInput.value) form.append("language", languageInput.value);
      const response = await fetch("/api/audio/transcribe", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: form
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Transcription could not be completed.");
      transcriptInput.value = String(data.transcript || "").slice(0, 4000);
      if (!transcriptInput.value) throw new Error("No speech was detected.");
      translationOutput.textContent = "";
      setStatus("Transcript ready. Review and edit it before sharing.");
    } catch (error) {
      setStatus(error.message || "Transcription is temporarily unavailable.");
    } finally {
      transcribeButton.disabled = false;
    }
  });

  translateButton.addEventListener("click", async () => {
    const text = transcriptInput.value.trim();
    if (!text) { setStatus("Transcribe or enter text before translating."); return; }
    if (text.length > 4000) { setStatus("Please shorten the transcript to 4,000 characters."); return; }
    if (!targetLanguage.value) { setStatus("Choose a target language first."); targetLanguage.focus(); return; }
    translateButton.disabled = true;
    setStatus("Translating transcript…");
    try {
      const data = await api("/api/translation/translate", {
        method: "POST",
        body: JSON.stringify({ text, sourceLanguage: "Auto-detect", targetLanguage: targetLanguage.value })
      });
      translationOutput.textContent = data.translation || "";
      if (!translationOutput.textContent) throw new Error("No translation was returned.");
      setStatus("Translation ready. Review it before sharing.");
    } catch (error) {
      setStatus(error.message || "Translation is temporarily unavailable.");
    } finally {
      translateButton.disabled = false;
    }
  });

  useButton.addEventListener("click", () => {
    const draft = (translationOutput.textContent || transcriptInput.value).trim();
    const composer = document.getElementById("message-input");
    if (!draft || !composer) { setStatus("There is no transcript to use yet."); return; }
    composer.value = draft.slice(0, 2000);
    composer.focus();
    setStatus("Draft placed in the message composer. Review it and press Send yourself.");
  });

  copyButton.addEventListener("click", async () => {
    const text = (translationOutput.textContent || transcriptInput.value).trim();
    if (!text) { setStatus("There is no transcript to copy yet."); return; }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Text copied. Review it before sharing.");
    } catch {
      transcriptInput.focus();
      transcriptInput.select();
      setStatus("Select the transcript and copy it using your device's copy command.");
    }
  });
})();