# Phase 103 — Shared realtime transport and multi-device sessions

## Implemented

- Added a per-participant socket-session set to active group calls. Multiple tabs/devices belonging to one authenticated user now share one participant entry and one participant-limit slot.
- A secondary device can join an account's existing group call in the same runtime. Leaving or disconnecting one device removes only that socket session; the participant remains until the last session leaves.
- Added an opt-in PostgreSQL Socket.IO adapter injection point to the PostgreSQL realtime server and staging runtime.
- Added migration 005 for the adapter's large/binary packet attachment table in the isolated `waltajjii` schema.
- Expanded real PostgreSQL integration to boot two independent staging runtimes and verify a room broadcast reaches a socket connected to the other runtime.
- Added unit and integration coverage for multi-device group-call membership and cross-runtime room delivery.

## Adapter package and setup

The opt-in staging caller supplies `createAdapter` from `@socket.io/postgres-adapter` (tested at 0.5.0) and the runtime's dedicated PostgreSQL pool. The same adapter channel prefix and table name must be used by every instance in the cluster. Migration `005_socketio_cluster_adapter.sql` creates the attachment table under the isolated `waltajjii` schema.

Example staging-only composition:

```js
const { createAdapter } = require("@socket.io/postgres-adapter");

createPostgresStagingRuntime({
  config: {
    // Other validated staging-only settings...
    createSocketAdapter: createAdapter,
    socketAdapterOptions: {
      tableName: "socket_io_attachments",
      channelPrefix: "waltajjii-realtime"
    }
  },
  // Inject Pool, bcrypt, and JWT dependencies...
});
```

Do not enable this adapter with a production or shared application database until the migration, permissions, pool sizing, failure behavior, and load tests are approved. Use a dedicated PostgreSQL connection pool per server instance for adapter traffic where practical; monitor connection limits and adapter health.

## Important limits

This phase does **not** make all realtime state cluster-safe:

- Direct-call pairing maps, active group-call participant state, hand raises, and presence snapshots are still process-local. Cross-instance room broadcasts work, but cross-instance call authorization/state does not yet. Do not distribute users across instances for active direct/group call workflows until Phase 104 adds shared transactional call state.
- Group-call state is still lost on a server restart.
- PostgreSQL adapter connection loss means broadcasts may be delivered only to clients on the local server until the adapter reconnects.
- Socket.IO's PostgreSQL adapter does not support connection-state recovery. HTTP long-polling deployments still require sticky sessions; websocket-only transport avoids the polling-session routing requirement but needs its own operational testing.
- The adapter's attachment table stores large/binary packets; monitor cleanup and database growth.
- No production Render service, SQLite entrypoint, Supabase project, secrets, production database, or user data is changed.

## Verification

CI provisions disposable PostgreSQL 16, applies migrations 001–005, boots two staging runtimes with the PostgreSQL adapter, and tests cross-instance room delivery. It also verifies multi-device group-call session handling and the existing staging/auth/realtime regressions.

## Next release gate

Phase 104 should implement transactionally shared call/session state (including simultaneous start/join races, per-user device membership, lease expiry, server crash recovery, and safe cleanup) before enabling active calls across multiple application instances.
