# Phase 99 — Isolated PostgreSQL staging bootstrap

## Delivered

- Adds an opt-in createPostgresStagingRuntime factory.
- Wires the Phase 98 injected service graph to the existing PostgreSQL API router and PostgreSQL Socket.IO server.
- Adds /health/live and database-backed /health/ready endpoints.
- Exposes an idempotent shutdown function that closes Socket.IO before the PostgreSQL pool.
- Requires explicit staging environment, a PostgreSQL database name marked staging, stage, test, or preview, and a separate media bucket carrying the same marker.
- Injects the Pool constructor, bcrypt/JWT implementations, and Supabase Storage client. No secrets are read from environment variables.

## Safety boundaries

- The factory is not imported by src/server.js; the active SQLite runtime and Render start command remain unchanged.
- It creates an HTTP server but does not call listen().
- It performs no schema migration, seed, cleanup, backup, storage write, or production cutover.
- It cannot prove that an externally supplied staging URL or Supabase client points to a separately provisioned project. Operators must provision and verify those resources independently before invoking the factory.
- Use a distinct staging database, Supabase project/storage bucket, JWT secret, and provider credentials. Never copy production credentials into staging.
- Do not deploy this runtime or change Render/Supabase settings until the full parity suite passes and the owner explicitly approves a separate staging deployment.

## Verification

Run:

    node --test test/phase99-postgres-staging-bootstrap.test.js test/phase98-postgres-service-composition.test.js test/phase97-postgres-runtime-migration-map.test.js test/phase96-staging-integration-safety.test.js

This phase is a staging bootstrap candidate, not evidence that all PostgreSQL routes or realtime events are behaviorally equivalent to the live SQLite application.
