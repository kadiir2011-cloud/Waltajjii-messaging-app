"use strict";

const { Server } = require("socket.io");
const { attachPostgresRealtime } = require("./postgres-realtime-socket");

/**
 * Opt-in PostgreSQL Socket.IO composition. The caller owns the HTTP server,
 * database pool, and shutdown lifecycle. This is not imported by src/server.js.
 */
function createPostgresRealtimeServer(httpServer, {
  jwt, jwtSecret, realtimeService, callState, serverId,
  socketOptions = {}, createSocketAdapter, adapterPool, adapterOptions = {}
} = {}) {
  if (!httpServer || typeof httpServer.listen !== "function") {
    throw new TypeError("An existing HTTP server is required.");
  }
  const io = new Server(httpServer, socketOptions);
  if (createSocketAdapter) {
    if (!adapterPool || typeof createSocketAdapter !== "function") {
      io.close();
      throw new TypeError("A PostgreSQL adapter factory and dedicated adapter pool are required together.");
    }
    io.adapter(createSocketAdapter(adapterPool, adapterOptions));
  }
  let state;
  try {
    state = attachPostgresRealtime(io, {
      jwt, jwtSecret, realtimeService, callState,
      serverId: serverId || require("node:crypto").randomUUID()
    });
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
