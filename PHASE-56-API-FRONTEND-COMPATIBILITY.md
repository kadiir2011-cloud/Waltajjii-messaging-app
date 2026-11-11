# Phase 56 — Application-wide API and frontend compatibility audit

## Scope and safety

Phase 56 establishes compatibility between the existing browser client, SQLite production API, and the isolated PostgreSQL services/routes. The PostgreSQL API remains opt-in and is **not** mounted by `src/server.js`.

- Base: `waltajjii-postgres-realtime-integration-phase55`
- Work branch: `waltajjii-phase56-api-frontend-regression`
- Tests use injected fake services, an in-process HTTP server, and local QR generation.
- No live Supabase, Render, production database, or user data is accessed by CI.

## Current production status

The live server still mounts the SQLite routers for auth, messages, groups, channels, uploads, social, moments and calls. Translation and online presence also retain their existing SQLite-era server composition. The browser's current request helper and endpoint paths are preserved.

## PostgreSQL API composition now available

`src/postgres/postgres-api-router.js` composes injected PostgreSQL services and routers for:

- Authentication and profiles
- Direct messages
- Groups and group governance (invitations, roles, polls, events, join requests)
- Channels and social/feed
- Moments and online presence
- Media uploads/profile pictures
- TURN credential retrieval
- Secure group invitation QR generation

The caller must provide the PostgreSQL adapter, service instances, JWT verifier/secret, media storage service and realtime snapshot. The helper does not create a pool, read or expose database credentials, or mount itself into the production server.

## Phase 56 media and call integration

### Media uploads and profile pictures

- `src/routes/postgres-uploads.js` preserves the browser's `POST /api/uploads`, `GET /api/uploads/:mediaId`, profile-picture upload, delete and retrieval paths.
- Message upload returns the expected `fileId` and `mediaType`; the ID is the PostgreSQL media-object BIGINT represented as a string.
- Profile pictures are limited to JPG/PNG/WebP and 2 MB; other media is limited to 10 MB and the existing MIME allowlist.
- Private objects are stored by the injected Supabase Storage service. No public bucket or public object URL is created.
- Download authorization is checked against direct-message participants, group membership or channel membership before an object is read. Profile-picture reads are authenticated and owner-scoped.
- Direct, group and channel PostgreSQL message services now validate opaque numeric media-object IDs rather than SQLite-era filenames.
- If profile-picture database update fails after upload, the new object is cleaned up where possible.

### Video calls

`src/routes/postgres-calls.js` preserves `GET /api/calls/turn-credentials`, verifies the JWT, obtains ICE server credentials from the existing Metered provider, and keeps the provider API key server-side. Missing provider configuration returns 503; provider failures return a generic 502 response.

### Invitation QR

The PostgreSQL group governance router now supports `POST /api/groups/invitation/qr`. It accepts only a Waltajjii-origin invitation URL with a well-formed `groupInvite` token and returns the same PNG data-URL response used by the browser UI.

## Remaining integration blockers

1. Moments still needs a complete durable-media lifecycle wired to media-object IDs, including expiry cleanup and ownership/visibility checks.
2. Translation must be included in the shared PostgreSQL composition or explicitly extracted as a database-independent shared route.
3. Complete endpoint-by-endpoint response-shape, validation, forbidden/not-found and provider-failure parity tests remain necessary.
4. Socket event names/payloads must be verified against every browser listener and all API mutations.
5. Group-event reminder delivery still needs scheduled worker integration, shutdown/retry behavior and idempotency tests.
6. SQLite exact-username login and PostgreSQL case-insensitive login behavior must be reconciled before cutover.
7. Browser E2E regression coverage is still outstanding.
8. Media lifecycle cleanup must cover deleted/expired message attachments and orphaned objects without deleting files still referenced by forwarded messages.

## Regression coverage

- `test/phase56-api-frontend-contract.test.js`: browser bearer-token/JSON behavior, major frontend API families, PostgreSQL route declarations and a guard against accidental production runtime switching.
- `test/phase56-postgres-api-composition.test.js`: HTTP-level route composition, auth protection, group invitation QR, media response and missing TURN configuration.
- `test/phase56-postgres-media-call-routes.test.js`: upload response compatibility, authenticated media access, profile-picture upload, TURN credential response and safe missing-configuration behavior.

These are injected-service HTTP integration and source-contract tests. They do not prove full Supabase integration, complete API parity or browser E2E behavior.

## Required exit criteria before PostgreSQL runtime cutover

- Full media lifecycle including Moments, message deletion/forwarding and orphan cleanup.
- Complete route composition including translation and every current frontend API path.
- Endpoint-level HTTP contract tests for success and all important authorization/error cases.
- Browser E2E coverage for registration/login, profiles, direct/group/channel messages, social/feed, moments/media, calls, translation and notifications.
- PostgreSQL event reminder worker scheduling, shutdown, retry and idempotency verification.
- Username policy reconciliation.
- Separate migration/recovery rehearsal, durable backup/restore, security/performance and rollback validation.

**No production deployment, live database DDL, data migration, merge, or Render change is authorized or performed by this phase.**
