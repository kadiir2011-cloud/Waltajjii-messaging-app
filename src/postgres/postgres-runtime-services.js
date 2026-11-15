"use strict";

const { createPostgresAuthService } = require("../services/postgres-auth-service");
const { createPostgresMessagesService } = require("../services/postgres-messages-service");
const { createPostgresGroupsService } = require("../services/postgres-groups-service");
const { createPostgresGroupGovernanceService } = require("../services/postgres-group-governance-service");
const { createPostgresChannelsService } = require("../services/postgres-channels-service");
const { createPostgresSocialService } = require("../services/postgres-social-service");
const { createPostgresMomentsService } = require("../services/postgres-moments-service");
const { createPostgresRealtimeService } = require("../services/postgres-realtime-service");
const { createPostgresMediaStorageService } = require("../services/postgres-media-storage-service");

/**
 * Builds the complete PostgreSQL service graph from explicitly injected
 * dependencies. It does not create a pool, read environment variables,
 * connect to Supabase, mount routes, start workers, or listen on a port.
 * The caller retains ownership of all resources and the cutover decision.
 */
function createPostgresRuntimeServices({
  db,
  bcrypt,
  jwt,
  jwtSecret,
  storageClient,
  mediaBucket = "waltajjii-media",
  clock
} = {}) {
  if (!db || !["one", "many", "execute", "withTransaction"].every(name => typeof db[name] === "function")) {
    throw new TypeError("A complete PostgreSQL adapter is required.");
  }
  if (!bcrypt || typeof bcrypt.hash !== "function" || typeof bcrypt.compare !== "function") {
    throw new TypeError("A bcrypt-compatible implementation is required.");
  }
  if (!jwt || typeof jwt.sign !== "function" || typeof jwt.verify !== "function") {
    throw new TypeError("A JWT implementation with sign() and verify() is required.");
  }
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new TypeError("A JWT secret of at least 32 characters is required.");
  }
  if (!storageClient || typeof storageClient.from !== "function") {
    throw new TypeError("A private Supabase Storage client is required.");
  }
  if (clock !== undefined && typeof clock !== "function") {
    throw new TypeError("clock must be a function when provided.");
  }

  const services = Object.freeze({
    auth: createPostgresAuthService({ db, bcrypt, jwt, jwtSecret }),
    messages: createPostgresMessagesService({ db }),
    groups: createPostgresGroupsService({ db }),
    governance: createPostgresGroupGovernanceService({ db, ...(clock ? { clock } : {}) }),
    channels: createPostgresChannelsService({ db }),
    social: createPostgresSocialService({ db }),
    moments: createPostgresMomentsService({ db }),
    realtime: createPostgresRealtimeService({ db })
  });
  const mediaStorage = createPostgresMediaStorageService({
    db, storageClient, bucket: mediaBucket
  });

  return Object.freeze({ services, mediaStorage });
}

module.exports = { createPostgresRuntimeServices };
