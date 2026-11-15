# Phase 102 — Isolated PostgreSQL staging integration

## Objective

Move PostgreSQL validation beyond mocked adapters by running the opt-in staging runtime against a disposable PostgreSQL 16 service and real authenticated Socket.IO clients. This is a CI staging rehearsal, not a production cutover.

## What the integration exercises

- Applies PostgreSQL schema migrations 001–003 to a disposable database named `waltajjii_staging`.
- Boots the actual `createPostgresStagingRuntime` composition with an injected PostgreSQL pool, bcrypt/JWT implementations, and a no-op test Storage adapter.
- Starts the staging HTTP/Socket.IO server on an ephemeral loopback port.
- Verifies live and database readiness health endpoints.
- Exercises JSON HTTP registration, login, authenticated profile retrieval, and unauthenticated rejection through the composed PostgreSQL API router.
- Connects real Socket.IO clients with signed Waltajjii JWTs.
- Verifies presence, group typing authorization, message delivery receipt persistence, direct-call offer/answer and recovery request/offer/answer.
- Verifies PostgreSQL group membership, group-call availability/start/join, group signaling, hand raise, admin moderation, rejection of unauthorized moderation, host termination, multi-session presence, and invalid-token rejection.
- Cleans up seeded users, messages, groups, sockets, runtime resources, and database pools.

## Destructive-test protection

The integration test refuses to run unless:
- `ALLOW_DISPOSABLE_POSTGRES_TESTS=1` is explicitly set.
- `TEST_DATABASE_URL` is a valid PostgreSQL URL.
- The database name contains a `staging`, `stage`, `test`, or `preview` marker.

The workflow provisions a fresh GitHub Actions PostgreSQL 16 service and uses only `waltajjii_staging`. It does not use any Render, Supabase, or production credentials.

## Runtime correction discovered during staging

The staging runtime now installs Express JSON body parsing before mounting `/api`. Without that middleware, JSON registration/login requests would reach the PostgreSQL auth routes with an empty request body. The Phase 99 bootstrap test asserts middleware ordering.

## Limits / release gates

- The test Storage adapter is intentionally non-persistent. This phase does not test Supabase Storage uploads or media download behavior.
- Group-call coordination remains in-memory and single-instance. Multi-instance call state and a shared Socket.IO adapter are still required before horizontally scaling.
- The CI environment is an isolated PostgreSQL integration service, not a long-lived externally hosted staging deployment.
- Before any production cutover, separately validate Supabase staging storage, real browser media permissions/WebRTC, reconnect/network-loss behavior, concurrency races, backup/restore, migration rollback, and a controlled user acceptance test.
- No production SQLite entrypoint, Render service, Supabase project, production database, environment variables, or live user data is changed.

## CI

The Phase 102 workflow starts PostgreSQL 16, installs the Socket.IO client as a CI-only test dependency, runs the staging safety/bootstrap tests, then runs the full PostgreSQL/HTTP/Socket.IO integration suite.
