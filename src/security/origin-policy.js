"use strict";

function parseOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function createOriginPolicy(env = {}) {
  const allowedOrigins = new Set();
  const configured = [
    env.CLIENT_URL,
    env.PUBLIC_APP_URL,
    env.RENDER_EXTERNAL_URL,
    ...(typeof env.WALTAJJII_ALLOWED_ORIGINS === "string"
      ? env.WALTAJJII_ALLOWED_ORIGINS.split(",")
      : [])
  ];
  for (const value of configured) {
    const origin = parseOrigin(value);
    if (origin) allowedOrigins.add(origin);
  }

  if (env.NODE_ENV !== "production") {
    const port = String(env.PORT || "3000");
    allowedOrigins.add("http://localhost:" + port);
    allowedOrigins.add("http://127.0.0.1:" + port);
  }

  function isAllowedOrigin(origin) {
    if (!origin) return true;
    const normalized = parseOrigin(origin);
    return Boolean(normalized && allowedOrigins.has(normalized));
  }

  function isAllowedRequestOrigin(origin, requestHost) {
    if (!origin) return true;
    const normalized = parseOrigin(origin);
    if (!normalized) return false;
    if (allowedOrigins.has(normalized)) return true;
    try {
      return Boolean(requestHost && new URL(normalized).host.toLowerCase() === String(requestHost).toLowerCase());
    } catch {
      return false;
    }
  }

  return Object.freeze({
    allowedOrigins: Object.freeze(Array.from(allowedOrigins)),
    isAllowedOrigin,
    isAllowedRequestOrigin
  });
}

module.exports = { createOriginPolicy, parseOrigin };
