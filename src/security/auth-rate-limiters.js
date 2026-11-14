"use strict";

function createAuthRateLimiters(rateLimit) {
  const common = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please wait before trying again." }
  };

  return {
    registrationLimiter: rateLimit({
      ...common,
      limit: 10
    }),
    loginLimiter: rateLimit({
      ...common,
      limit: 5,
      skipSuccessfulRequests: true,
      message: { error: "Too many unsuccessful login attempts. Please wait 15 minutes before trying again." }
    })
  };
}

module.exports = { createAuthRateLimiters };
