"use strict";

// Phase 86 session-claim policy. This is a validation primitive for the
// forthcoming server-side session integration; it does not verify signatures.
const MAX_SESSION_SECONDS = 2 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

function inspectSessionClaims(claims, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    return { valid: false, reason: "invalid-payload" };
  }
  if (claims.iss !== "waltajjii") return { valid: false, reason: "invalid-issuer" };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes("waltajjii-users")) {
    return { valid: false, reason: "invalid-audience" };
  }
  if (!Number.isSafeInteger(claims.userId) || claims.userId <= 0) {
    return { valid: false, reason: "invalid-user" };
  }
  if (typeof claims.username !== "string" || !/^[a-zA-Z0-9_]{3,30}$/.test(claims.username)) {
    return { valid: false, reason: "invalid-username" };
  }
  if (!Number.isSafeInteger(claims.iat) || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "invalid-issued-at" };
  }
  if (!Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds) {
    return { valid: false, reason: "expired-or-missing-expiry" };
  }
  if (claims.exp <= claims.iat || claims.exp - claims.iat > MAX_SESSION_SECONDS) {
    return { valid: false, reason: "session-lifetime-exceeded" };
  }
  return { valid: true, userId: claims.userId, username: claims.username, expiresAt: claims.exp };
}

module.exports = { inspectSessionClaims, MAX_SESSION_SECONDS, CLOCK_SKEW_SECONDS };
