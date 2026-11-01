const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "blob:"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/uploads", require("./routes/uploads"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Verify each connection using the existing Waltajjii login token.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required."));
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
      return next(new Error("Server authentication is not configured."));
    }

    const user = jwt.verify(token, secret, {
      issuer: "waltajjii",
      audience: "waltajjii-users"
    });

    if (!user.userId || !user.username) {
      return next(new Error("Invalid user token."));
    }

    socket.data.userId = user.userId;
    socket.data.username = user.username;

    next();
  } catch {
    next(new Error("Invalid or expired login token."));
  }
});

const activeCalls = new Map();

function endTrackedCall(userId, targetUserId, notify = true) {
  const user = String(userId);
  const target = String(targetUserId);

  if (!user || !target || user === target) return false;

  const userPeer = activeCalls.get(user);
  const targetPeer = activeCalls.get(target);

  if (userPeer !== target || targetPeer !== user) {
    return false;
  }

  activeCalls.delete(user);
  activeCalls.delete(target);

  if (notify) {
    io.to(`user:${target}`).emit("call:ended", {
      senderId: userId
    });
  }

  return true;
}

io.on("connection", (socket) => {
  console.log(
    "Authenticated Socket.IO user connected:",
    socket.data.username
  );

  socket.join(`user:${socket.data.userId}`);

  socket.on("call:offer", (data = {}, acknowledge = () => {}) => {
    try {
      const callerId = String(socket.data.userId);
      const targetUserId = String(data.targetUserId || "");
      const offer = data.offer;

      if (
        !targetUserId ||
        targetUserId === callerId ||
        !offer ||
        typeof offer !== "object" ||
        Array.isArray(offer)
      ) {
        return acknowledge({ ok: false, error: "Invalid call offer." });
      }

      if (!io.sockets.adapter.rooms.has(`user:${targetUserId}`)) {
        return acknowledge({ ok: false, error: "Recipient is not connected." });
      }

      if (activeCalls.has(callerId) || activeCalls.has(targetUserId)) {
        return acknowledge({ ok: false, error: "One participant is already in a call." });
      }

      activeCalls.set(callerId, targetUserId);
      activeCalls.set(targetUserId, callerId);

      io.to(`user:${targetUserId}`).emit("call:incoming", {
        callerId: socket.data.userId,
        callerUsername: socket.data.username,
        offer
      });

      acknowledge({ ok: true });
    } catch {
      acknowledge({ ok: false, error: "Could not start call." });
    }
  });

  socket.on("call:answer", (data = {}, acknowledge = () => {}) => {
    const recipientId = String(socket.data.userId);
    const targetUserId = String(data.targetUserId || "");
    const answer = data.answer;

    if (
      !targetUserId ||
      !answer ||
      typeof answer !== "object" ||
      Array.isArray(answer) ||
      activeCalls.get(recipientId) !== targetUserId ||
      activeCalls.get(targetUserId) !== recipientId
    ) {
      return acknowledge({ ok: false, error: "Call answer is not authorized." });
    }

    io.to(`user:${targetUserId}`).emit("call:accepted", {
      recipientId: socket.data.userId,
      recipientUsername: socket.data.username,
      answer
    });

    acknowledge({ ok: true });
  });

  socket.on("call:ice-candidate", (data = {}) => {
    const senderId = String(socket.data.userId);
    const targetUserId = String(data.targetUserId || "");
    const candidate = data.candidate;

    if (
      !targetUserId ||
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      activeCalls.get(senderId) !== targetUserId ||
      activeCalls.get(targetUserId) !== senderId
    ) {
      return;
    }

    io.to(`user:${targetUserId}`).emit("call:ice-candidate", {
      senderId: socket.data.userId,
      candidate
    });
  });

  socket.on("call:end", (data = {}) => {
    const senderId = String(socket.data.userId);
    const targetUserId = String(data.targetUserId || "");

    if (
      !targetUserId ||
      activeCalls.get(senderId) !== targetUserId ||
      activeCalls.get(targetUserId) !== senderId
    ) {
      return;
    }

    endTrackedCall(senderId, targetUserId, true);
  });

  socket.on("disconnect", () => {
    const userId = String(socket.data.userId);
    const targetUserId = activeCalls.get(userId);

    if (targetUserId) {
      endTrackedCall(userId, targetUserId, true);
    }

    console.log(
      "Socket.IO user disconnected:",
      socket.data.username
    );
  });
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Waltajjii server listening on port ${PORT}`);
});
