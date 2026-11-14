"use strict";

const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 30 * 60 * 1000;

function hashRecoveryToken(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    throw new TypeError("A valid recovery token is required.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createRecoveryToken(options = {}) {
  const ttlMs = options.ttlMs === undefined ? DEFAULT_TTL_MS : options.ttlMs;
  const now = options.now === undefined ? Date.now() : options.now;
  const bytes = options.randomBytes || randomBytes;

  if (!Number.isSafeInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    throw new RangeError("Recovery-token lifetime must be between one and thirty minutes.");
  }
  if (!Number.isFinite(now)) throw new TypeError("A valid creation time is required.");

  const token = bytes(32).toString("base64url");
  if (typeof token !== "string" || token.length < 40) {
    throw new Error("Secure random token generation failed.");
  }

  return {
    token,
    tokenHash: hashRecoveryToken(token),
    expiresAt: new Date(now + ttlMs)
  };
}

function isRecoveryTokenExpired(expiresAt, now = Date.now()) {
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now)) return true;
  return expiry <= now;
}

function matchesRecoveryToken(expectedHash, candidateToken) {
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  if (typeof candidateToken !== "string" || candidateToken.length < 32 || candidateToken.length > 256) {
    return false;
  }
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashRecoveryToken(candidateToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

module.exports = {
  createRecoveryToken,
  hashRecoveryToken,
  isRecoveryTokenExpired,
  matchesRecoveryToken,
  DEFAULT_TTL_MS,
  MIN_TTL_MS,
  MAX_TTL_MS
};
