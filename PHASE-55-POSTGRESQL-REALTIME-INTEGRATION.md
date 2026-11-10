# Phase 55 — Full PostgreSQL and Socket.IO integration

## Objective
Exercise Waltajjii's PostgreSQL-backed realtime path through a real HTTP server, a real Socket.IO server, real Socket.IO clients, and disposable PostgreSQL 16. This closes the gap between the Phase 44 fake Socket.IO harness and actual network-level realtime behavior.

## Included
- Opt-in PostgreSQL Socket.IO composition helper, which attaches the realtime module to an HTTP server and exposes a minimal online-user snapshot.
- Real-client integration test against ordered draft migrations 001–003.
- PostgreSQL-backed group room initialization and membership authorization.
- Direct and group typing events.
- Delivery receipt persistence and sender notification.
- Authenticated WebRTC offer/answer signaling.
- Multi-session presence: one tab disconnecting does not mark the user offline while another remains connected.
- Rejection of unauthenticated network Socket.IO connections.
- CI uses ephemeral PostgreSQL 16 and installs the matching Socket.IO client only for this test.

## Safety boundaries
- The helper is opt-in and is not mounted in src/server.js.
- The existing SQLite runtime remains unchanged.
- No real Supabase schema, bucket, storage object, or data is accessed.
- No Render environment, service, deployment, or DNS setting is changed.
- No pull request is merged.

## Verification
Run only against a disposable PostgreSQL database:

1. Set TEST_DATABASE_URL to a disposable database, never live Supabase.
2. Run npm ci.
3. Run npm install --no-save --package-lock=false socket.io-client@4.8.1.
4. Run node --test test/phase55-postgres-realtime-integration.test.js.

CI provisions PostgreSQL 16, applies migrations 001–003, starts a real Socket.IO server on an ephemeral port, and drives it with real WebSocket clients.

## Known limits / next work
- This is a single-process realtime integration. Multi-instance presence and room fan-out need a shared Socket.IO adapter (for example Redis) before horizontal scaling.
- Existing application routers and the event reminder worker are not switched to PostgreSQL by this phase.
- This helper is not the production runtime switch. Phase 56 must audit HTTP/socket/frontend contract parity and run broad application regression tests.
- Durable media delivery authorization and parent-record linkage remain separate from registering an uploaded object. Do not treat media storage foundations as a complete public media pipeline.
- SQLite-to-PostgreSQL migration, backup/restore, recovery and operational readiness remain outstanding.
