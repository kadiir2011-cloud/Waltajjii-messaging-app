# Phase 56 — Application-wide API and frontend compatibility audit

## Scope and safety

This phase establishes an evidence-based compatibility baseline between the existing browser client, SQLite production API, and isolated PostgreSQL route/service modules. It does **not** switch production runtime or claim full feature parity.

- Base: `waltajjii-postgres-realtime-integration-phase55`
- Work branch: `waltajjii-phase56-api-frontend-regression`
- PostgreSQL API composition is now available as an **opt-in** injected router for controlled staging/integration tests. It is not mounted in `src/server.js`.
- CI tests use only injected fake services and an in-process HTTP server; no live Supabase or Render resources are accessed.

## Findings

### 1. Current production API remains SQLite

`src/server.js` mounts the existing SQLite routers for auth, messages, groups, channels, uploads, social, moments, and calls. It also implements translation and online presence directly in the server. The browser client in `public/app.js` calls these established paths through a shared `api()` helper that adds bearer authorization and JSON content type.

### 2. PostgreSQL route coverage and composition

| Feature | PostgreSQL implementation | Status |
|---|---|---|
| Registration, login, profile | `postgres-auth.js` | Core endpoints and opt-in composition exist; username case-sensitivity still needs reconciliation |
| Direct messages | `postgres-messages.js` | Core paths composed; response semantics still need endpoint-level parity tests |
| Groups and group messages | `postgres-groups.js` | Core paths composed |
| Group governance | `postgres-group-governance.js` | Invitations, role changes, details, activity, join requests, polls and events composed alongside group routes |
| Channels | `postgres-channels.js` | Core paths composed; compare every browser-used action and response shape |
| Social/feed | `postgres-social.js` | Core paths composed |
| Moments | `postgres-moments.js` | Composed; durable upload/read/delete callbacks must be injected and tested |
| Online presence | `postgres-presence.js` + realtime service | Composed; online IDs are supplied by the caller's realtime snapshot |
| Uploads/profile pictures | No complete PostgreSQL-compatible API router | **Gap:** existing browser upload and profile-picture flows still depend on SQLite-era upload behavior |
| Calls/TURN credentials | Existing SQLite `calls.js` route | **Gap:** no equivalent PostgreSQL TURN-credentials endpoint |
| Translation | Implemented directly in `src/server.js` | Database-independent; extract or explicitly retain in shared application composition |
| Group invitation QR | Existing SQLite group route | **Gap:** PostgreSQL governance creates invitation URLs but has no matching QR endpoint |

### 3. Opt-in composition helper

`src/postgres/postgres-api-router.js` composes the existing PostgreSQL routers using injected services, JWT verification, optional media callbacks, Socket.IO reference, and online-user snapshot. It does not create a database pool, read secrets from the environment, or change the live server. The caller owns lifecycle, service construction, and mounting.

The helper intentionally does not mount uploads, TURN credentials, or translation. It throws early if required service methods or a strong JWT secret are missing.

### 4. Remaining integration blockers

1. Upload/profile-picture APIs need durable object authorization, metadata/parent-record linkage, and safe media retrieval—not merely object upload.
2. TURN credentials need a PostgreSQL-runtime-compatible route that preserves existing provider configuration and authorization.
3. Group invitation QR generation needs a matching route or deliberate frontend-only QR implementation.
4. Frontend response contracts need executable HTTP tests for success, validation, unauthorized, forbidden, not-found and provider/storage failures.
5. Socket event names and payloads must remain consistent with browser listeners while PostgreSQL HTTP routers emit updates.
6. Existing group-event reminder delivery method still needs scheduled worker integration and idempotent operational tests.
7. SQLite login uses exact username matching while PostgreSQL auth lookup was previously audited as case-insensitive; decide and test one policy before cutover.
8. Browser E2E regression coverage remains outstanding.

## Regression coverage

- `test/phase56-api-frontend-contract.test.js`: browser bearer-token/JSON behavior, major frontend API families, PostgreSQL route declarations, and a guard preventing accidental production runtime switching.
- `test/phase56-postgres-api-composition.test.js`: real HTTP server verifies that PostgreSQL API feature routers are composed and protected by authentication; checks fail-fast configuration validation.

These are source-contract and injected-service HTTP integration tests, not full browser E2E tests or proof of complete parity.

## Required exit criteria before PostgreSQL runtime cutover

- Complete PostgreSQL API composition for every user-facing route, including uploads, profile pictures, TURN credentials, invitation QR and translation.
- Complete browser/API request and response parity, including all governance and media flows.
- HTTP contract tests for every endpoint, including authorization and error cases.
- Browser E2E regression coverage for registration/login, profile, direct/group/channel messaging, social/feed, moments/media, calls, translation and notifications.
- PostgreSQL event reminder worker scheduling, shutdown, retry and idempotency verification.
- Separate migration/recovery rehearsal, durable backup/restore, security/performance and rollback validation.

**No production deployment, live database DDL, data migration, merge, or Render change is authorized or performed by this phase.**
