# Phase 56 — Application-wide API and frontend compatibility audit

## Scope and safety

This phase establishes an evidence-based compatibility baseline between the existing browser client, SQLite production API, and the isolated PostgreSQL route/service modules. It does **not** switch production runtime or claim full feature parity.

- Base: `waltajjii-postgres-realtime-integration-phase55`
- Work branch: `waltajjii-phase56-api-frontend-regression`
- PostgreSQL routers remain opt-in and are not mounted by `src/server.js`.
- CI uses source-contract checks only; no live Supabase or Render resources are accessed.

## Findings

### 1. Current production API remains SQLite

`src/server.js` mounts the existing SQLite routers for auth, messages, groups, channels, uploads, social, moments, and calls. It also implements translation and online presence directly in the server. The browser client in `public/app.js` calls these established paths through a shared `api()` helper that adds the bearer token and JSON content type.

### 2. PostgreSQL route coverage

| Feature | PostgreSQL implementation | Frontend/API compatibility status |
|---|---|---|
| Registration, login, profile | `postgres-auth.js` | Core endpoints exist; username case-sensitivity behavior still needs reconciliation with SQLite |
| Direct messages | `postgres-messages.js` | Core paths align; verify response shape and delete/edit/forward/reaction semantics in HTTP contract tests |
| Groups and group messages | `postgres-groups.js` | Core group paths exist |
| Group governance | `postgres-group-governance.js` | Separate router exists for invitations, role changes, details, activity, join requests, polls and events; composition/mounting is outstanding |
| Channels | `postgres-channels.js` | Core channels and additional message interaction endpoints exist; compare every browser-used action and response shape |
| Social/feed | `postgres-social.js` | Core discovery, follow, connections, requests, feed, comments and notifications paths exist |
| Moments | `postgres-moments.js` | Service/router exists, but media callbacks must be connected to the durable media pipeline |
| Online presence | `postgres-presence.js` + realtime service | Router exists; composition must provide the online-user snapshot consistently |
| Uploads/profile pictures | No complete PostgreSQL-compatible API router | **Gap:** existing browser upload and profile-picture flows still depend on SQLite-era upload behavior |
| Calls/TURN credentials | Existing SQLite `calls.js` route | **Gap:** PostgreSQL application composition has no equivalent TURN-credentials endpoint |
| Translation | Implemented directly in `src/server.js` | Database-independent, but should be extracted or explicitly retained in shared application composition |
| Group invitation QR | Existing SQLite group route | **Gap:** PostgreSQL governance router creates invitation URLs but has no matching QR endpoint |

### 3. Integration blockers

1. No PostgreSQL application composition root mounts all PostgreSQL routers together.
2. The group governance router must be mounted alongside the PostgreSQL groups router without conflicting route order or duplicate authentication assumptions.
3. Upload/profile-picture APIs need durable object authorization, metadata/parent-record linkage, and safe media retrieval—not merely object upload.
4. TURN credentials need a PostgreSQL-runtime-compatible route that preserves existing provider configuration and authorization.
5. Group invitation QR generation needs a matching route or a deliberate frontend-only QR implementation.
6. Frontend response contracts need executable HTTP tests for success, validation, unauthorized, forbidden, not-found and provider/storage failures.
7. Socket event names and payloads must remain consistent with the browser listeners while PostgreSQL HTTP routers emit updates.
8. Existing group-event reminder delivery method still needs a scheduled worker integration and idempotent operational tests.
9. SQLite login uses exact username matching while PostgreSQL auth lookup was previously audited as case-insensitive; decide and test one policy before cutover.

## Regression baseline added in Phase 56

`test/phase56-api-frontend-contract.test.js` checks:
- the browser API helper continues to send bearer authorization and JSON requests correctly;
- the browser client still references key API families;
- the PostgreSQL router source files expose the currently implemented route patterns;
- the live SQLite server is not accidentally switched to PostgreSQL by this audit-only phase;
- known integration gaps remain explicitly visible in the test baseline.

These are static contract guards, not full browser E2E tests or proof of complete parity. Follow-up Phase 56 work should add injected-service HTTP tests and browser-level tests before any runtime switch.

## Required exit criteria before PostgreSQL runtime cutover

- One tested PostgreSQL application composition root for every API route and Socket.IO event.
- Complete browser/API request and response parity, including upload, profile picture, TURN credentials, group QR/invitations and governance.
- HTTP contract tests for all user-facing endpoints, including authorization and error cases.
- Browser E2E regression coverage for registration/login, profile, direct/group/channel messaging, social/feed, moments/media, calls, translation and notifications.
- PostgreSQL event reminder worker scheduling, shutdown, retry and idempotency verification.
- Separate migration/recovery rehearsal, durable backup/restore, security/performance and rollback validation.

**No production deployment, live database DDL, data migration, merge, or Render change is authorized or performed by this phase.**
