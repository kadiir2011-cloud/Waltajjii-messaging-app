"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePostgresStagingConfig,
  createPostgresStagingRuntime
} = require("../src/postgres/postgres-staging-runtime");

function config(overrides = {}) {
  return {
    appEnvironment: "staging",
    nodeEnvironment: "test",
    databaseUrl: "postgresql://stage_user:secret@db.example.test/waltajjii_staging",
    mediaBucket: "waltajjii-media-staging",
    jwtSecret: "s".repeat(48),
    storageClient: { from() { return {}; } },
    ...overrides
  };
}

test("accepts only explicitly isolated staging resources", () => {
  const result = validatePostgresStagingConfig(config());
  assert.equal(result.databaseName, "waltajjii_staging");
  assert.equal(result.mediaBucket, "waltajjii-media-staging");
});

test("rejects production mode, unmarked databases, and production media buckets", () => {
  assert.throws(() => validatePostgresStagingConfig(config({ appEnvironment: "production" })), /appEnvironment=staging/);
  assert.throws(() => validatePostgresStagingConfig(config({ nodeEnvironment: "production" })), /NODE_ENV=production/);
  assert.throws(() => validatePostgresStagingConfig(config({ databaseUrl: "postgres://u:p@host/waltajjii" })), /database name must be explicitly marked/);
  assert.throws(() => validatePostgresStagingConfig(config({ mediaBucket: "waltajjii-media" })), /separate staging media bucket/);
  assert.throws(() => validatePostgresStagingConfig(config({ databaseUrl: "sqlite:///tmp/test.db" })), /must use PostgreSQL/);
});

test("validates before constructing a database pool", () => {
  let poolCreated = false;
  class Pool { constructor() { poolCreated = true; } }
  assert.throws(() => createPostgresStagingRuntime({
    config: config({ mediaBucket: "waltajjii-media" }), Pool
  }), /separate staging media bucket/);
  assert.equal(poolCreated, false);
});

test("builds an un-listened runtime and closes realtime before pool", async () => {
  const order = [];
  let capturedRouterOptions;
  let appUses = [];
  const fakeExpress = () => ({
    disable() {}, get() {}, set() {}, use(...args) { appUses.push(args); }
  });
  fakeExpress.json = () => ({ type: "json-parser" });
  class Pool {
    constructor(options) { this.options = options; }
    async query() { return { rows: [{ value: 1 }], rowCount: 1 }; }
    async connect() {
      return { query: async () => ({ rows: [] }), release() {} };
    }
    async end() { order.push("pool"); }
  }
  const runtime = createPostgresStagingRuntime({
    config: config(), Pool,
    bcrypt: { hash: async () => "hash", compare: async () => true },
    jwt: { sign: () => "token", verify: () => ({ userId: 1 }) },
    express: fakeExpress,
    createHttpServer: app => ({ app, listen() { throw new Error("must not listen"); } }),
    createApiRouter: options => { capturedRouterOptions = options; return {}; },
    createRealtimeServer: () => ({
      io: {}, getOnlineUserIds: () => [],
      close: async () => { order.push("realtime"); }
    })
  });
  assert.equal(runtime.environment, "staging");
  assert.equal(runtime.pool.options.connectionString, config().databaseUrl);
  assert.equal(capturedRouterOptions.services, runtime.services);
  assert.equal(capturedRouterOptions.mediaStorage, runtime.mediaStorage);
  assert.deepEqual(appUses[0], [{ type: "json-parser" }]);
  assert.equal(appUses[1][0], "/api");
  assert.equal(typeof runtime.httpServer.listen, "function");
  await runtime.close();
  await runtime.close();
  assert.deepEqual(order, ["realtime", "pool"]);
});

test("fails closed when a required staging dependency is missing", () => {
  assert.throws(() => createPostgresStagingRuntime({
    config: config(), bcrypt: {}, jwt: {}
  }), /Pool constructor must be injected/);
});
