"use strict";

const jwt = require("jsonwebtoken");

function verifyAccessToken(token, db) {
  if (!token || typeof token !== "string" || !db) {
    throw new Error("Invalid access token.");
  }
  const payload = jwt.verify(token, process.env.JWT_SECRET, {
    issuer: "waltajjii",
    audience: "waltajjii-users"
  });
  if (!payload.userId) throw new Error("Invalid access token.");
  const user = db.prepare("SELECT token_version AS tokenVersion FROM users WHERE id = ?")
    .get(payload.userId);
  const currentVersion = Number(user?.tokenVersion ?? 0);
  const tokenVersion = Number(payload.tokenVersion ?? 0);
  if (!user || !Number.isSafeInteger(tokenVersion) || tokenVersion !== currentVersion) {
    throw new Error("Session has been revoked.");
  }
  return payload;
}

module.exports = { verifyAccessToken };
