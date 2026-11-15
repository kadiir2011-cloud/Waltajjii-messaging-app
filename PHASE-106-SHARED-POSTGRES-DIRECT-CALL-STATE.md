# Phase 106 — shared PostgreSQL direct-call state

## Integrated
- Replaces the opt-in PostgreSQL realtime handler's process-local one-to-one call pairing map with transactional PostgreSQL call sessions and participant reservations.
- Direct-call invitations reserve both participants atomically before the incoming-call event is emitted, preventing simultaneous cross-instance call races.
- Acceptance and reconnect recovery register per-device leases in the shared call-state tables.
- Offer/answer, ICE, captions, and recovery signaling are authorized against the shared participant/session state; Socket.IO PostgreSQL adapter user rooms deliver events across independent runtimes.
- Ending a direct call transactionally releases both participants and all device leases.
- Direct-call lease expiry preserves the call reservation while a participant is temporarily disconnected, allowing that participant to rejoin while the other participant remains active. The call ends after all device leases expire.
- Migration 008 adds indexes for active direct-call participant and session lookups.

## Verification
The Phase 55/102 real PostgreSQL integration now runs two separate staging runtimes and places the caller on one runtime and the callee on the other. It exercises incoming offer, acceptance, recovery request, recovery offer/answer, then verifies group calling can start after the direct call ends. CI also runs the existing call-state, realtime parity, authentication, and performance suites.

## Boundaries
- This is opt-in PostgreSQL staging code only. The production Render service still runs the SQLite runtime.
- Media remains peer-to-peer; this service coordinates signaling, authorization, and call lifecycle state.
- Presence snapshots and typing state remain process-local in this phase.
- The PostgreSQL Socket.IO adapter distributes rooms but does not provide connection-state recovery; sticky sessions remain required if HTTP long-polling is enabled.
- No production database, Supabase resource, Render service, secret, storage bucket, or user data is changed by this phase.

## Release gate
Do not merge this phase into the live SQLite production branch or deploy PostgreSQL runtime code into the current Render service. Production cutover requires a separately approved PostgreSQL migration plan, verified backup and restore, rehearsed full data migration, secret configuration, storage validation, health checks, and rollback procedure.
