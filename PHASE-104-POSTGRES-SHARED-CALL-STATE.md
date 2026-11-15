# Phase 104 — Transactional PostgreSQL call-state foundation

## Delivered in this phase
- Added migration 006 with durable call sessions, account-level participants, and per-device/per-server socket leases.
- Added a transaction-backed call-state service for group-call start/join/status/end, heartbeat renewal, and idempotent socket-session leave.
- Group membership is checked against PostgreSQL; group start/join are serialized on the group row; database uniqueness constraints enforce one active call per account and one active group call per group.
- Multiple tabs/devices share one participant record and consume one of the eight participant slots. Device disconnect removes the account participant only after its last live lease ends.
- A host lease expiry ends the call rather than leaving an orphaned call. Expired device leases are reconciled when the call is accessed.

## Safety boundary
This is a PostgreSQL staging foundation, not a production cutover. The service is composed into the opt-in staging runtime only. The active Render app still uses the SQLite runtime and does not import this module. Do not apply migration 006 to Supabase production or switch Render to the PostgreSQL runtime until the remaining realtime event handlers are wired to this service and cross-instance tests cover signaling, moderation, race conditions, revocation, and process-crash recovery.

The PostgreSQL Socket.IO adapter distributes room broadcasts but does not provide connection-state recovery; HTTP long-polling still requires sticky sessions. See the official [Postgres adapter documentation](https://socket.io/docs/v4/postgres-adapter).

## Known next integration gate
- Wire direct-call and group-call Socket.IO handlers to this shared service (no process-local call maps as source of truth).
- Add transactional moderation, hand-raise, direct-call recovery and cross-instance signaling authorization.
- Add scheduled lease reaper and integration tests for simultaneous start/join, stale server leases, and server restart.
- Do not enable multiple production instances for calls before that gate passes.
