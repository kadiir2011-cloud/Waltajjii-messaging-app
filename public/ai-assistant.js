"use strict";
(function initWaltajjiiAiAssistant() {
  const panel = document.getElementById("wt-ai-panel");
  const contextInput = document.getElementById("wt-ai-context");
  const actionInput = document.getElementById("wt-ai-action");
  const languageInput = document.getElementById("wt-ai-language");
  const consentInput = document.getElementById("wt-ai-consent");
  const generateButton = document.getElementById("wt-ai-generate");
  const status = document.getElementById("wt-ai-status");
  const resultWrap = document.getElementById("wt-ai-result-wrap");
  const result = document.getElementById("wt-ai-result");
  const useButton = document.getElementById("wt-ai-use-result");
  const copyButton = document.getElementById("wt-ai-copy-result");
  if (!panel || !contextInput || !generateButton || typeof api !== "function") return;

  function setStatus(message) { status.textContent = message; }

  document.addEventListener("waltajjii:ai-context", event => {
    const selected = typeof event.detail?.context === "string" ? event.detail.context : "";
    contextInput.value = selected.slice(0, 8000);
    result.textContent = "";
    resultWrap.hidden = true;
    consentInput.checked = false;
    setStatus("Review the selected text and privacy notice, then confirm before generating.");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  generateButton.addEventListener("click", async () => {
    const context = contextInput.value.trim();
    if (!context) { setStatus("Select a message or enter text first."); contextInput.focus(); return; }
    if (!consentInput.checked) {
      setStatus("Please confirm that this selected text may be sent to the AI provider.");
      consentInput.focus();
      return;
    }
    generateButton.disabled = true;
    resultWrap.hidden = true;
    result.textContent = "";
    setStatus("Waltajjii AI is preparing your result…");
    try {
      const request = {
        action: actionInput.value,
        context,
        ...(languageInput.value ? { outputLanguage: languageInput.value } : {})
      };
      const data = await api("/api/ai/assist", { method: "POST", body: JSON.stringify(request) });
      if (typeof data.result !== "string" || !data.result.trim()) {
        throw new Error("Waltajjii AI returned an empty result. Please try again.");
      }
      result.textContent = data.result;
      resultWrap.hidden = false;
      setStatus("Result ready. Review it carefully. Nothing has been sent or saved.");
    } catch (error) {
      setStatus(error.message || "Waltajjii AI is temporarily unavailable.");
    } finally {
      generateButton.disabled = false;
    }
  });

  useButton.addEventListener("click", () => {
    const draft = result.textContent.trim();
    if (!draft) return;
    const composer = document.getElementById("message-input");
    if (!composer) { setStatus("The message composer is unavailable."); return; }
    composer.value = draft.slice(0, 2000);
    composer.focus();
    setStatus("Draft placed in the composer. Review it and press Send yourself when ready.");
  });

  copyButton.addEventListener("click", async () => {
    const output = result.textContent.trim();
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setStatus("AI result copied. Review it before sharing.");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(result);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      setStatus("Select the result and copy it using your device's copy command.");
    }
  });
})();