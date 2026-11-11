# Phase 37 — PostgreSQL schema and service contract audit

**Status:** Static review completed; corrective work is required before any database connection.
**Base branch:** `waltajjii-postgres-test-harness-phase36`
**Base commit:** `2a01f2e1ce84d4e25e48196fb95a4cca76521292`
**Scope:** Read-only comparison of the current SQLite schema, proposed PostgreSQL DDL, and isolated PostgreSQL auth/realtime services.
**Safety:** Documentation only. No application runtime changes, database connection, SQL execution, Supabase change, Render change, merge, or deployment.

## 1. Phase 36 verification

The Phase 36 isolated PostgreSQL test-app workflow completed successfully (run 2). This verifies the injected HTTP test harness and its automated tests. It does **not** verify a real PostgreSQL server, the proposed DDL, or production integration.

## 2. Confirmed compatible contracts

- The current SQLite auth route and PostgreSQL auth service use the same username format (3–30 ASCII letters, digits, underscores), password length (12–128), bcrypt cost (12), JWT lifetime (2 hours), issuer (`waltajjii`) and audience (`waltajjii-users`).
- The JWT payload uses `userId`; the new auth and presence routes read that same claim. This matches the existing SQLite login route.
- The PostgreSQL profile service selects the profile columns present in the current SQLite schema migrations and the draft PostgreSQL `users` table.
- The realtime service's `users`, `group_members`, and `messages` column references exist in the current schema and the draft DDL.
- PostgreSQL's `LOWER(username)` unique index and case-insensitive login lookup preserve the intended ASCII username behavior of SQLite's `COLLATE NOCASE`.

## 3. Required corrections before integration

### P37-01 — Enforce poll-option ownership

The current vote table references `poll_id` and `option_id` independently. A malicious or faulty client could therefore submit a vote whose poll ID refers to one poll while the option ID belongs to another poll. The current foreign keys do not prevent that mismatch.

Required schema hardening:
1. Add a unique constraint/index on `group_poll_options(poll_id, id)`.
2. Replace or supplement the independent option reference with a composite foreign key from `group_poll_votes(poll_id, option_id)` to `group_poll_options(poll_id, id)`.
3. Add a migration test proving a vote for an option from a different poll is rejected, while a valid vote is accepted.

Do not apply this change until existing application vote semantics and migration compatibility are checked.

### P37-02 — Preserve the existing profile update contract

The SQLite `PATCH /profile` route returns a successful update response even if the supplied user ID no longer exists (the update affects zero rows). The new PostgreSQL service returns 404 in that case. This is a defensible improvement, but it is an observable API behavior difference. Decide and document whether to preserve the legacy response or intentionally adopt 404, then add a parity/contract test.

### P37-03 — Timestamp conversion must be explicit

The SQLite database stores event `starts_at`, moment `expires_at`, invitation `expires_at`, and other timestamps as text. The PostgreSQL DDL uses `TIMESTAMPTZ`. A migration must define how existing timestamp strings are interpreted (especially strings without an explicit UTC offset), how Ethiopian local time is represented, and how API JSON timestamps are serialized. Do not rely on an implicit cast or assume UTC.

### P37-04 — BIGINT identifiers must remain consistent

The PostgreSQL `pg` driver returns BIGINT values as strings by default. The new services generally preserve this, but all future route, Socket.IO, authorization, room-name, client comparison, and JSON code must consistently handle string IDs. Do not convert IDs to JavaScript Number without a safe-integer check.

### P37-05 — Verify online-presence source before mounting

The isolated presence router reads `req.app.get("onlineUserIds")`. The test app is intentionally dependency-injected and does not establish a production Socket.IO presence lifecycle. Before mounting it in a real server, the PostgreSQL-backed path must define how this set is populated, updated on disconnect, shared across multiple tabs, and synchronized across multiple server instances. The existing SQLite server behavior must be documented and regression-tested first.

### P37-06 — Verify connection TLS against the chosen Supabase endpoint

The current pool config sets `ssl: { rejectUnauthorized: true }`. This is a security-conscious default, but its compatibility with the exact Supabase direct or pooler endpoint and runtime CA trust must be tested using the official endpoint guidance. Do not weaken certificate validation merely to make a connection succeed. Do not add a live `DATABASE_URL` yet.

## 4. Scope limitations and further gates

- The 29-table draft remains a structural starting point, not a validated executable migration.
- The isolated auth and realtime services have unit tests with injected adapters; they have not been tested against PostgreSQL.
- The current app remains synchronous SQLite. No production route or Socket.IO handler has been switched.
- The event reminder worker and all remaining feature routes still require asynchronous conversion and end-to-end parity tests.
- Before a test database is connected, validate every DDL column, key, foreign-key action, unique constraint, index, default, and data conversion against the current SQLite schema and all active SQL usage.
- The test database must be isolated and empty or disposable. Production data must not be used for the first connection test.

## 5. Recommended next sequence

1. Complete P37-01 to P37-06 as schema/service contract tests and documented decisions.
2. Add an automated schema contract test that checks the critical DDL invariants without connecting to a database.
3. Build a disposable PostgreSQL test environment and run the migration only after explicit approval.
4. Run auth/profile and realtime service integration tests against that isolated database.
5. Continue route-by-route conversion and Socket.IO/worker conversion; keep SQLite as the only live runtime until full parity gates pass.

## 6. Safety statement

This phase has not:
- connected to Supabase PostgreSQL;
- executed `001_initial_schema.sql` or any other SQL;
- changed Supabase tables, policies, storage, or credentials;
- changed Render environment variables or deployed the application;
- migrated, copied, or deleted any user accounts or messages;
- merged any pull request.

**Conclusion:** Phase 36's test harness is green. Phase 37 identifies specific contract and integrity checks that must be resolved before a real PostgreSQL connection. Keep the existing Waltajjii test deployment and SQLite data path unchanged.
