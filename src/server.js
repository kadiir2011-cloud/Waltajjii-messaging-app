const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

require("dotenv").config();
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"]
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
app.use("/api/channels", require("./routes/channels"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/social", require("./routes/social"));
app.use("/api/moments", require("./routes/moments"));
app.use("/api/calls", require("./routes/calls"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Make the authenticated Socket.IO server available to API routes.
app.set("io", io);

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
const onlineUsers = new Map();

// Authenticated, privacy-limited snapshot of currently connected members.
app.get("/api/presence/online", (req, res) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Login required." });
  }
  let viewer;
  try {
    viewer = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "waltajjii",
      audience: "waltajjii-users"
    });
  } catch {
    return res.status(401).json({ error: "Invalid or expired login token." });
  }

  const onlineIds = Array.from(onlineUsers.keys())
    .filter(id => id !== String(viewer.userId));
  if (!onlineIds.length) return res.json({ users: [] });

  const placeholders = onlineIds.map(() => "?").join(",");
  const users = db.prepare(`
    SELECT id AS userId,
           COALESCE(NULLIF(full_name, ''), 'Waltajjii member') AS fullName,
           avatar_path AS avatarPath,
           CASE WHEN profile_mode IN ('professional','both') THEN professional_title ELSE '' END AS professionalTitle,
           CASE WHEN profile_mode IN ('professional','both') THEN organization ELSE '' END AS organization
    FROM users
    WHERE id IN (${placeholders})
    ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE
  `).all(...onlineIds);
  res.set("Cache-Control", "no-store");
  res.json({ users });
});

function stopSocketTyping(socket) {
  const targetUserId = socket.data.typingTo;
  if (!targetUserId) return;

  io.to(`user:${targetUserId}`).emit("typing:update", {
    userId: socket.data.userId,
    username: socket.data.username,
    isTyping: false
  });

  socket.data.typingTo = null;
}

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

  const userId = String(socket.data.userId);
  const userRoom = `user:${userId}`;
  const wasOnline = onlineUsers.has(userId);

  socket.join(userRoom);

  // Join every group room this authenticated user currently belongs to.
  const groupMemberships = db.prepare(
    "SELECT group_id FROM group_members WHERE user_id = ?"
  ).all(socket.data.userId);
  groupMemberships.forEach(({ group_id }) => socket.join(`group:${group_id}`));

  onlineUsers.set(userId, socket.data.username);

  // Give the new session a current snapshot, then notify others on first login.
  socket.emit("presence:snapshot", {
    users: Array.from(onlineUsers, ([id, username]) => ({
      userId: id,
      username
    }))
  });

  if (!wasOnline) {
    io.emit("presence:update", {
      userId,
      username: socket.data.username,
      online: true
    });
  }

  socket.on("typing:start", (data = {}) => {
    const targetUserId = String(data.targetUserId || "");
    if (
      !targetUserId ||
      targetUserId === userId ||
      !io.sockets.adapter.rooms.has(`user:${targetUserId}`)
    ) return;

    if (socket.data.typingTo && socket.data.typingTo !== targetUserId) {
      stopSocketTyping(socket);
    }

    socket.data.typingTo = targetUserId;
    io.to(`user:${targetUserId}`).emit("typing:update", {
      userId: socket.data.userId,
      username: socket.data.username,
      isTyping: true
    });
  });

  socket.on("typing:stop", (data = {}) => {
    const targetUserId = String(data.targetUserId || "");
    if (!targetUserId || socket.data.typingTo === targetUserId) {
      stopSocketTyping(socket);
    }
  });

  socket.on("group:typing:start", (data = {}, acknowledge = () => {}) => {
    const groupId = Number(data.groupId);
    if (!Number.isSafeInteger(groupId) || groupId < 1 ||
        !db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, socket.data.userId)) {
      return acknowledge({ ok: false, error: "You are not a member of this group." });
    }
    if (!socket.data.typingGroups) socket.data.typingGroups = new Set();
    if (!socket.data.typingGroups.has(groupId)) {
      socket.data.typingGroups.add(groupId);
      socket.to(`group:${groupId}`).emit("group:typing:update", {
        groupId, userId: socket.data.userId, username: socket.data.username, isTyping: true
      });
    }
    acknowledge({ ok: true });
  });

  socket.on("group:typing:stop", (data = {}) => {
    const groupId = Number(data.groupId);
    if (!Number.isSafeInteger(groupId) || !socket.data.typingGroups?.has(groupId)) return;
    socket.data.typingGroups.delete(groupId);
    socket.to(`group:${groupId}`).emit("group:typing:update", {
      groupId, userId: socket.data.userId, username: socket.data.username, isTyping: false
    });
  });

  // A recipient confirms delivery only after the authenticated client receives the message.
  socket.on("message:delivered", (data = {}, acknowledge = () => {}) => {
    const messageId = Number(data.messageId);
    if (!Number.isSafeInteger(messageId) || messageId < 1) {
      return acknowledge({ ok: false, error: "Invalid message." });
    }

    const updated = db.prepare(`
      UPDATE messages
      SET delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND receiver_id = ?
    `).run(messageId, socket.data.userId);

    if (!updated.changes) {
      return acknowledge({ ok: false, error: "Message not found for this recipient." });
    }

    const receipt = db.prepare(`
      SELECT m.id AS messageId, m.sender_id AS senderId,
             m.receiver_id AS receiverId, s.username AS sender,
             r.username AS recipient, m.delivered_at AS deliveredAt,
             m.read_at AS readAt
      FROM messages m
      JOIN users s ON s.id = m.sender_id
      JOIN users r ON r.id = m.receiver_id
      WHERE m.id = ?
    `).get(messageId);

    io.to(`user:${receipt.senderId}`).emit("message:status", {
      ...receipt,
      status: receipt.readAt ? "read" : "delivered"
    });
    acknowledge({ ok: true });
  });

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
    const disconnectedUserId = String(socket.data.userId);
    const targetUserId = activeCalls.get(disconnectedUserId);

    stopSocketTyping(socket);

    // Clear any group typing indicators left by this disconnected session.
    for (const groupId of socket.data.typingGroups || []) {
      socket.to(`group:${groupId}`).emit("group:typing:update", {
        groupId, userId: socket.data.userId, username: socket.data.username, isTyping: false
      });
    }
    socket.data.typingGroups?.clear();

    if (targetUserId) {
      endTrackedCall(disconnectedUserId, targetUserId, true);
    }

    // A user remains online while any of their other tabs/devices are connected.
    const remainingSessions = io.sockets.adapter.rooms.get(`user:${disconnectedUserId}`)?.size || 0;
    if (remainingSessions === 0) {
      onlineUsers.delete(disconnectedUserId);
      io.emit("presence:update", {
        userId: disconnectedUserId,
        username: socket.data.username,
        online: false
      });
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
