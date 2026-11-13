"use strict";

const COMMON_PASSWORDS = new Set([
  "password1234", "password123!", "password123", "qwerty123456",
  "123456789012", "1234567890", "iloveyou1234", "welcome1234",
  "admin123456", "letmein12345", "changeme1234", "waltajjii123"
]);

function validateNewPassword(password, username = "") {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return "Password must be between 12 and 128 characters.";
  }
  const normalized = password.normalize("NFKC").toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return "Choose a less common password or a longer passphrase.";
  }
  const normalizedUsername = String(username).normalize("NFKC").trim().toLowerCase();
  if (normalizedUsername.length >= 3 && normalized.includes(normalizedUsername)) {
    return "Your password must not contain your username.";
  }
  if (/^(.)\1+$/.test(password) || /^(?:012345|123456|abcdef|qwerty)/i.test(password)) {
    return "Choose a less predictable password or passphrase.";
  }
  return null;
}

module.exports = { validateNewPassword };
