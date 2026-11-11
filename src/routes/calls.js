const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Login required." });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "waltajjii",
      audience: "waltajjii-users"
    });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired login token." });
  }
}

router.get("/turn-credentials", authenticate, async (req, res) => {
  const apiKey = process.env.METERED_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: "Video calling is not configured yet. Please contact the administrator."
    });
  }

  try {
    const response = await fetch(
      "https://waltajjii-calls.metered.live/api/v1/turn/credentials?apiKey=" +
      encodeURIComponent(apiKey)
    );

    if (!response.ok) {
      console.error("Metered TURN credential request failed:", response.status);
      return res.status(502).json({ error: "Could not load video-call network settings." });
    }

    const iceServers = await response.json();

    if (!Array.isArray(iceServers) || iceServers.length === 0) {
      return res.status(502).json({ error: "The video-call provider returned no network servers." });
    }

    return res.json({ iceServers });
  } catch (error) {
    console.error("TURN credential request error:", error.message);
    return res.status(502).json({ error: "Video-call network settings are temporarily unavailable." });
  }
});

module.exports = router;
