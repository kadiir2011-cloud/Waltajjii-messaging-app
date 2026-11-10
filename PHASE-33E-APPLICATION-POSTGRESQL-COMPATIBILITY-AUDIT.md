# Phase 33E — Existing Application PostgreSQL Compatibility Audit

**Status:** Audit/documentation only. No application runtime files changed.
**Base:** `waltajjii-postgres-adapter-phase33c` at `0fda79097d9e8026d1bc82ca692b97274c9acbff`.
**Safety:** This branch does not connect to PostgreSQL, execute migrations, alter Supabase, or change Render.

## Executive finding

The Phase 33C PostgreSQL adapter, pool configuration, and isolated authentication service are useful foundations, but the existing Waltajjii application is not yet PostgreSQL-runtime compatible. The production application remains synchronous `better-sqlite3`. The PostgreSQL service must not be wired into the server as a drop-in replacement.

A safe migration requires an asynchronous repository/data-access layer and coordinated conversion of every route and Socket.IO/worker database call. Until then, keep SQLite as the only runtime database and keep the PostgreSQL service isolated.

## Files inspected and findings

| Area | Existing implementation | Migration requirement |
|---|---|---|
| `src/db.js` | Opens a local `waltajjii.db`, runs SQLite DDL and incremental `PRAGMA table_info` migrations at startup; enables WAL and foreign keys | Replace startup schema mutation with versioned PostgreSQL migrations; do not run SQLite initialization in PostgreSQL mode |
| `src/routes/auth.js` | Registration, login, profile read and update use synchronous `db.prepare().run/get`; bcrypt and JWT are already used | Convert handlers to async service calls; preserve response payloads, rate limiting, validation and JWT issuer/audience |
| `src/server.js` | Presence endpoint, group-room membership, group typing authorization, direct-message delivery/read receipts and group-event reminder worker use SQLite synchronously | Convert each to async PostgreSQL operations; ensure Socket.IO callbacks acknowledge only after DB success |
| `src/routes/messages.js` | Direct-message route and history operations are SQLite-coupled | Full async conversion, parameterized PostgreSQL SQL, transaction and receipt semantics |
| `src/routes/groups.js` | Group/member/message/poll/event operations are SQLite-coupled | Full conversion, membership authorization, transactional group actions, event/reminder correctness |
| `src/routes/channels.js` | Channel/member/message operations are SQLite-coupled | Full conversion and access-control parity |
| `src/routes/social.js` | Follows, connection requests, posts, likes, comments and notifications use SQLite | Full conversion; preserve uniqueness and notification behavior |
| `src/routes/moments.js` | Moment storage/expiry queries use SQLite date functions | Convert expiry logic to PostgreSQL timestamp comparisons |
| `src/routes/uploads.js` and `src/storage.js` | Upload metadata/application records are coupled to SQLite while object storage uses Supabase Storage | Separate relational metadata persistence from Supabase Storage object operations; retain current bucket and file validations |

## Compatibility findings

### 1. Authentication and profile parity

The current SQLite auth route and Phase 33C PostgreSQL auth service align on:
- Username validation: 3–30 letters, numbers or underscores.
- Password length: 12–128 characters.
- bcrypt cost factor: 12.
- JWT lifetime: 2 hours.
- JWT issuer: `waltajjii`.
- JWT audience: `waltajjii-users`.
- Profile field limits, profile background choices, profile modes and website URL validation.

The PostgreSQL login query uses `LOWER(username) = LOWER($1)`; this matches the SQLite `username COLLATE NOCASE UNIQUE` behavior for ordinary ASCII usernames. The PostgreSQL schema has a unique index on `LOWER(username)`, which must remain in place.

The PostgreSQL service returns BIGINT identifiers. The `pg` driver normally represents BIGINT values as strings. This is acceptable for JWT claims and Socket.IO room names only if every route/client comparison and JSON response handles string IDs consistently. Do not blindly convert arbitrary BIGINT IDs to JavaScript Number.

### 2. Socket.IO and presence are database-dependent

The server currently reads group memberships on socket connection, checks group membership for typing, and writes message delivery/read receipt timestamps from Socket.IO events. These handlers are synchronous today. A PostgreSQL migration must:
- Make connection-time membership loading asynchronous without emitting a presence-ready state too early.
- Recheck group membership in the database for privileged group events.
- Persist delivery/read receipts before emitting success acknowledgements.
- Handle database errors without crashing the Socket.IO process.
- Preserve multi-tab online status and call lifecycle behavior.

### 3. Group-event reminder worker

The worker currently uses SQLite-specific `julianday()`, `INSERT OR IGNORE`, synchronous transactions, and `lastInsertRowid`. It must be rewritten using PostgreSQL timestamp arithmetic, `INSERT ... ON CONFLICT DO NOTHING RETURNING`, and an atomic transaction. A multi-instance deployment also requires a concurrency-safe claim mechanism so two server instances cannot deliver duplicate reminders.

### 4. SQL dialect and driver differences

A full conversion must address:
- `?` placeholders → `$1, $2, ...`.
- `INSERT OR IGNORE` → explicit `ON CONFLICT ... DO NOTHING`.
- `lastInsertRowid` → `RETURNING id`.
- `db.transaction()` → adapter `withTransaction()`.
- SQLite `datetime()`, `julianday()`, `COLLATE NOCASE`, `PRAGMA`, and `AUTOINCREMENT`.
- SQLite integer booleans → PostgreSQL SMALLINT/BOOLEAN conventions already chosen in the schema.
- BIGINT identifiers and timestamps in the Node.js application.
- PostgreSQL transaction boundaries for multi-row operations and side effects.

### 5. Schema review items still required

Before any live migration is approved:
- Add a composite constraint ensuring each group poll vote's `option_id` belongs to the same `poll_id` as the vote.
- Verify every `ON CONFLICT` target used by the future repository layer has a matching unique/primary-key constraint.
- Review every foreign-key delete action against current application behavior.
- Confirm all 29 application tables and every column used by routes are represented, including late-stage feature columns.
- Validate timestamp/time-zone semantics and BIGINT serialization.
- Verify the PostgreSQL connection mode and TLS requirements against the actual Supabase connection endpoint before creating a pool.

## Recommended migration sequence

1. **33E-1 — Freeze behavioral contracts:** document endpoint request/response shapes, auth/session rules, Socket.IO event payloads and error semantics.
2. **33E-2 — PostgreSQL schema hardening:** fix poll vote integrity and verify all constraints/indexes/columns against the live SQLite schema source; still no execution.
3. **33E-3 — Auth/profile integration in an isolated test harness:** wire only in a test-only app composition, with no production route switch.
4. **33E-4 — Presence and Socket.IO persistence:** async room membership, group authorization and message receipts.
5. **33E-5 — Route-by-route conversion:** messages, groups, channels, social, moments, uploads.
6. **33E-6 — Reminder worker and lifecycle:** atomic reminder claims, graceful pool shutdown and error handling.
7. **33E-7 — End-to-end parity tests:** registration/login/profile, two-user messaging, receipts, group authorization, polls, events, uploads and restart persistence.
8. **33E-8 — Controlled test deployment:** only after explicit approval, configure a test-only DATABASE_URL and run a reviewed migration against an isolated schema/database.

## Release gates

Do not merge the PostgreSQL runtime, run the SQL migration, add DATABASE_URL to Render, or deploy until all of the following are true:
- All routes and Socket.IO handlers are async-compatible.
- No application runtime path still calls synchronous SQLite APIs in PostgreSQL mode.
- The schema has been reviewed and tested against an isolated PostgreSQL database.
- Endpoint and Socket.IO regression tests pass.
- A backup and rollback plan exists.
- The user explicitly approves the database connection and test deployment.

## Current conclusion

**Not ready to switch runtime.** Phase 33C/33D validate foundations and dependency installation only. This audit confirms the main conversion work remains ahead. The existing Render service and Supabase project have not been changed by this phase.
