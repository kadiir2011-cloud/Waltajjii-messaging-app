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

### Moments media

- The PostgreSQL Moments router now uses the private media-object service for upload, read and delete.
- Media IDs are stored as opaque PostgreSQL BIGINT strings in the Moments record.
- The visibility query is evaluated before the owner-scoped object download, so a follower/public viewer can read a visible Moment without gaining access to unrelated private objects.
- Expiry cleanup removes associated objects through a dedicated `removeById` method restricted to `purpose='moment'`; normal user deletion remains owner-scoped.
- Upload rollback removes the newly stored object if Moment creation fails.

### Video calls

`src/routes/postgres-calls.js` preserves `GET /api/calls/turn-credentials`, verifies the JWT, obtains ICE server credentials from the existing Metered provider, and keeps the provider API key server-side. Missing provider configuration returns 503; provider failures return a generic 502 response.

### Translation

- `src/routes/postgres-translation.js` preserves the browser's authenticated `POST /api/translation/translate` endpoint and the existing language allowlist.
- It validates source/target languages and text length, applies a per-minute rate limit, and uses the OpenAI Responses API through an injected provider key/fetch implementation.
- Provider credentials remain server-side; responses are marked `Cache-Control: no-store`.
- The route is included in the opt-in PostgreSQL API composition. Without `OPENAI_API_KEY`, it returns the existing safe 503 message.

### Invitation QR

The PostgreSQL group governance router now supports `POST /api/groups/invitation/qr`. It accepts only a Waltajjii-origin invitation URL with a well-formed `groupInvite` token and returns the same PNG data-URL response used by the browser UI.

## Remaining integration blockers

1. Translation provider configuration must be supplied securely in the PostgreSQL runtime; no API key is stored in source or returned to the browser.
3. Complete endpoint-by-endpoint response-shape, validation, forbidden/not-found and provider-failure parity tests remain necessary.
4. Socket event names/payloads must be verified against every browser listener and all API mutations.
5. The opt-in PostgreSQL reminder worker now has interval lifecycle, overlap protection and graceful shutdown; it is not started by the production server. It still needs controlled staging scheduling/retry/monitoring verification before cutover.
6. SQLite exact-username login and PostgreSQL case-insensitive login behavior must be reconciled before cutover.
7. Browser E2E regression coverage is still outstanding.
7. Media lifecycle cleanup must cover deleted/expired message attachments and orphaned objects without deleting files still referenced by forwarded messages.

## Regression coverage

- `test/phase56-api-frontend-contract.test.js`: browser bearer-token/JSON behavior, major frontend API families, PostgreSQL route declarations and a guard against accidental production runtime switching.
- `test/phase56-postgres-api-composition.test.js`: HTTP-level route composition, auth protection, group invitation QR, media response and missing TURN configuration.
- `test/phase56-postgres-media-call-routes.test.js`: upload response compatibility, authenticated media access, profile-picture upload, TURN credential response and safe missing-configuration behavior.
- `test/phase56-postgres-translation.test.js`: authenticated translation, language validation, provider request safety and missing-key behavior.
- `test/phase56-postgres-reminder-worker.test.js`: reminder worker overlap protection, idempotent start and graceful stop.
- `test/phase56-browser-e2e.test.js`: Playwright Chromium desktop/mobile smoke tests for registration, login and direct messaging.

These are injected-service HTTP integration and source-contract tests. The new Playwright suite in `test/phase56-browser-e2e.test.js` additionally exercises real Chromium desktop and mobile browser flows against a mocked API, including login, registration, recipient selection and direct-message sending. Browser coverage is a smoke-test baseline, not proof of full Supabase integration, complete API parity or full end-to-end coverage of every feature.

## Required exit criteria before PostgreSQL runtime cutover

- Complete media lifecycle tests for Moments, message deletion/forwarding and orphan cleanup.
- Complete route composition for every current frontend API path and final request/response parity checks.
- Endpoint-level HTTP contract tests for success and all important authorization/error cases.
- Browser E2E coverage for registration/login, profiles, direct/group/channel messages, social/feed, moments/media, calls, translation and notifications.
- Controlled staging integration of the PostgreSQL reminder worker, including scheduler ownership, shutdown, retries, monitoring and idempotency verification.
- Username policy reconciliation.
- Separate migration/recovery rehearsal, durable backup/restore, security/performance and rollback validation.

**No production deployment, live database DDL, data migration, merge, or Render change is authorized or performed by this phase.**
