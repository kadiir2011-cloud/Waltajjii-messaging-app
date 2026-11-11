"use strict";

const { Server } = require("socket.io");
const { attachPostgresRealtime } = require("./postgres-realtime-socket");

/**
 * Opt-in PostgreSQL Socket.IO composition. The caller owns the HTTP server,
 * database pool, and shutdown lifecycle. This is not imported by src/server.js.
 */
function createPostgresRealtimeServer(httpServer, {
  jwt, jwtSecret, realtimeService, socketOptions = {}
} = {}) {
  if (!httpServer || typeof httpServer.listen !== "function") {
    throw new TypeError("An existing HTTP server is required.");
  }
  const io = new Server(httpServer, socketOptions);
  let state;
  try {
    state = attachPostgresRealtime(io, { jwt, jwtSecret, realtimeService });
  } catch (error) {
    io.close();
    throw error;
  }
  return Object.freeze({
    io,
    getOnlineUserIds: state.getOnlineUserIds,
    getOnlineUserSnapshot: state.getOnlineUserSnapshot,
    close: () => new Promise(resolve => io.close(resolve))
  });
}

module.exports = { createPostgresRealtimeServer };
