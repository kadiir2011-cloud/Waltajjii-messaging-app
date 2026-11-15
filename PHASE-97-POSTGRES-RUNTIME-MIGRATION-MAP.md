# Phase 97 — PostgreSQL runtime migration map

## Purpose
Create an evidence-based migration plan for the PostgreSQL application composition. This phase is an inventory and guardrail only; it does not change the runtime database, HTTP routes, Socket.IO behavior, Render, Supabase, or production data.

## Confirmed current runtime
- `package.json` starts the app with `node src/server.js` and includes both `better-sqlite3` and `pg`.
- `src/server.js` imports `./db`, mounts the existing SQLite route modules, and performs synchronous `db.prepare(...)` work in presence and Socket.IO handlers.
- The live HTTP composition includes auth, messages, groups, channels, uploads, social, Moments and calls, plus inline translation and online-presence endpoints.
- The live Socket.IO composition performs synchronous SQLite queries for group-room membership, group typing authorization, message delivery receipts, call state and other realtime workflows.
- `src/db/postgres-adapter.js` provides async query helpers and transaction support, but its own module comment correctly says it is not wired into the running app.
- `src/postgres/postgres-api-router.js` is an opt-in composition. It wires PostgreSQL auth, messages, groups, group governance, channels, social, Moments, presence, uploads, calls, translation, AI assistant and audio intelligence routes.
- `src/postgres/postgres-realtime-server.js` and `src/postgres/postgres-realtime-socket.js` provide a separate opt-in realtime implementation.

## Migration coverage matrix

| Domain | Existing SQLite runtime | PostgreSQL implementation | Remaining cutover work |
|---|---|---|---|
| Authentication/profile | `routes/auth.js` | `routes/postgres-auth.js`, auth service | Contract parity, token/session and account recovery tests |
| Direct messaging | `routes/messages.js` | `routes/postgres-messages.js`, messages service | API parity, receipts, edits, forwards, reactions, media lifecycle |
| Groups | `routes/groups.js` | PostgreSQL groups + governance routers/services | Full permissions, invitations, polls/events, receipts, group-call behavior |
| Channels | `routes/channels.js` | PostgreSQL channels router/service | Full membership/owner moderation, message lifecycle and socket rooms |
| Social/feed | `routes/social.js` | PostgreSQL social router/service | Contract parity for connections, feed, comments, likes and notifications |
| Moments | `routes/moments.js` | PostgreSQL Moments router/service | Transaction and media ownership tests; expiry worker/cleanup verification |
| Uploads/media | `routes/uploads.js`, `storage.js` | PostgreSQL uploads + media storage service | Private bucket policy, profile and attachment ownership, rollback/cleanup |
| Calls | `routes/calls.js` + inline Socket.IO | PostgreSQL calls route + realtime socket | Signaling parity, group calls, TURN secrets, disconnect/reconnect tests |
| Presence | Inline `/api/presence/online` + Socket.IO | PostgreSQL presence route + realtime service | Multi-instance presence semantics and room membership parity |
| Translation | Inline translation route | PostgreSQL translation route | Supported language parity, provider timeouts and rate-limit parity |
| AI/audio | Existing inline/client integrations | PostgreSQL AI/audio routes | Confirm frontend endpoints, privacy policy, limits and provider configuration |
| Background jobs | Existing cleanup/maintenance paths | PostgreSQL workers | Scheduler/worker deployment, idempotency, retry and graceful shutdown |

## Required migration sequence

### Wave 1 — runtime composition and shared middleware
- Build a separate PostgreSQL server factory; do not mutate `src/server.js` in place.
- Match Helmet, origin allow-list, CORS, JSON limits, rate limits, static frontend, health/readiness endpoints and request logging.
- Validate required configuration at startup without logging secrets.
- Implement graceful HTTP, Socket.IO and PostgreSQL pool shutdown.
- Add a feature flag that is disabled by default; do not permit an implicit production cutover.

### Wave 2 — HTTP contract parity
- Capture existing frontend API contracts and compare status codes, response shapes, pagination, validation and authorization.
- Run route-by-route integration tests against disposable PostgreSQL.
- Verify database migrations from an empty database and a rehearsed SQLite export.
- Test media ownership, upload compensation and cleanup behavior with a private non-production bucket.

### Wave 3 — realtime parity
- Compare every Socket.IO event, acknowledgement, room join/leave and disconnect cleanup between implementations.
- Verify direct and group message delivery/read receipts, typing, presence, one-to-one and group calls, captions and reconnect behavior.
- Verify authorization for every room and event; test multiple simultaneous sockets and multiple server instances.

### Wave 4 — operational staging
- Deploy a separate staging service with an isolated PostgreSQL database and isolated storage bucket.
- Run end-to-end browser tests for registration, profile, messaging, groups, channels, feed, Moments, uploads, calls, translation, AI/audio and responsive UI.
- Test backup restore, observability, rate limits, storage policies, migration rollback and data reconciliation.
- Record exact artifact/commit, service/database identifiers, test evidence and sign-off.

### Wave 5 — production cutover (separate approval)
- Freeze writes and create/verify backups.
- Rehearse migration and compare record counts, ownership references and media inventory.
- Require explicit release approval before changing production environment or routing.
- Maintain a tested rollback path and monitor after cutover.

## Non-negotiable safety gates
- Never mount PostgreSQL routes beside SQLite routes under the same paths without a deliberate routing strategy; avoid accidental endpoint shadowing.
- Never point staging at production database, JWT secrets, Supabase project or media bucket.
- Never run destructive migration or cleanup tools on production during rehearsal.
- Do not declare PostgreSQL runtime ready based only on unit tests or a green CI workflow.
- Keep the existing SQLite production server and Render deployment unchanged until a separately approved cutover.

## Phase 97 exit criteria
This inventory is complete when the source guard test passes and the route/event inventory is reviewed. It does not certify PostgreSQL runtime readiness; that requires the integration and staging waves above.
