# Phase 105 — Shared PostgreSQL call state in realtime handlers

## Integrated
- The opt-in PostgreSQL Socket.IO server now requires and injects the shared call-state service.
- Group-call start, join, status, participant signaling authorization, hand-raise, moderation, leave, host end, and disconnect cleanup now read/write PostgreSQL state. The former process-local group-call maps are removed from the realtime handler.
- Each joined socket/device registers a lease identified by server ID and socket ID. A 15-second heartbeat renews the 45-second lease; disconnect/leave releases the device session. Expired sessions are reconciled by call-state operations.
- Group-call participant lists and hand-raise state are read from PostgreSQL. Host/admin moderation is checked transactionally against current group membership and role. Removing a participant revokes all of that account's device sessions.
- Socket.IO PostgreSQL adapter rooms carry group-call signaling and notifications between independent staging runtimes.
- Migration 007 adds persisted hand-raise state after migration 006.

## Verification
The real PostgreSQL integration test boots two independent staging runtimes against a disposable PostgreSQL database and verifies a call started on one runtime can be joined, queried, signaled, moderated, and ended by sockets on the other runtime. The test also exercises account multi-device sessions and revocation.

## Explicit boundaries
- This is wired into the opt-in PostgreSQL staging runtime only. The production Render app still uses the existing SQLite server and is not changed by this PR.
- Direct one-to-one call pairing/recovery maps, online presence snapshots, and typing state remain process-local in this phase. They are not yet safe as cross-instance authoritative state.
- Group-call audio/video remains peer-to-peer; the server coordinates signaling and authorization only.
- A 45-second lease can expire if a server is paused or a database connection is unavailable for longer than the lease. The heartbeat stops after the database reports that a session is no longer active.
- The Socket.IO PostgreSQL adapter distributes room broadcasts but does not itself provide connection-state recovery. Sticky sessions remain required if HTTP long-polling is enabled.

## Release gate
Do not merge this PR into the live SQLite production branch, apply migrations 006/007 to production Supabase, or enable multi-instance production calls without a separate approved PostgreSQL cutover plan, backup, and deployment rehearsal. No production service, database, secret, storage bucket, or user data was changed in this phase.
