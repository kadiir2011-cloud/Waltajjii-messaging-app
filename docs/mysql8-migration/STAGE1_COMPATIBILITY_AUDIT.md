# Stage 1 — SQLite-to-MySQL 8 Compatibility Audit

**Repository:** `kadiir2011-cloud/Waltajjii-messaging-app`  
**Branch:** `waltajjii-mysql8-migration-preparation`  
**Audit basis:** source files on the migration branch, inspected 2026-11-24  
**Status:** Static source audit completed; remediation and live-data validation remain outstanding.  
**Safety:** Audit only. No production database, Render service, Supabase project, or live deployment was accessed or changed.

## 1. Executive result

The disposable MySQL 8.0.36 validation instance successfully creates all 29 draft application tables and passes the current smoke tests for pending-request uniqueness, historical requests, foreign keys, and selected CHECK constraints.

That result validates the tested DDL behaviors only. It does **not** establish application compatibility. The existing application is still coupled to synchronous `better-sqlite3`; `src/db-mysql.js` is isolated and is not imported by `src/server.js`. The `mysql2` package is not yet in `package.json` or the lockfile.

The static audit inspected the SQLite schema/bootstrap file, the MySQL draft schema, the isolated adapter, package manifest, all seven SQLite route modules, and the main Socket.IO/server module.

### Overall assessment

**Application readiness for MySQL: NOT READY.**  
**Schema draft: promising, but still requires a column/index/constraint parity pass and data-driven decisions.**  
**Production migration: NOT authorized and not safe to begin.**

## 2. Application database access inventory

The current source has approximately **188** direct `db.prepare(...)` call sites across the audited runtime files and **8** synchronous `db.transaction(...)` call sites. The code expects synchronous `.get()`, `.all()`, and `.run()` results.

| File | `db.prepare` call sites | Synchronous transactions |
|---|---:|---:|
| `src/routes/auth.js` | 4 | 0 |
| `src/routes/messages.js` | 27 | 0 |
| `src/routes/groups.js` | 84 | 5 |
| `src/routes/channels.js` | 15 | 1 |
| `src/routes/social.js` | 32 | 1 |
| `src/routes/moments.js` | 9 | 0 |
| `src/routes/uploads.js` | 7 | 0 |
| `src/server.js` (Socket.IO + reminder worker) | 10 | 1 |
| **Total** | **188** | **8** |

These are source call-site counts, not a count of unique SQL statements. The true conversion effort also includes helper functions, control flow, event handlers, and result-shape changes.

### Required runtime changes

1. Convert every database-dependent Express handler and Socket.IO callback to asynchronous control flow and await every query.
2. Replace synchronous transaction callbacks with `withTransaction(async connection => ...)`; all statements inside one transaction must use that same connection.
3. Replace `lastInsertRowid` with mysql2's `insertId`, and normalize the ID according to the chosen BIGINT policy.
4. Replace SQLite `.changes` with MySQL `affectedRows`, after checking behavior for matched-but-unchanged updates.
5. Replace SQLite constraint error-code checks with explicit MySQL duplicate-key/constraint handling. Do not translate all SQL errors into duplicate conflicts.
6. Keep the SQLite implementation available on the preparation branch until MySQL feature parity and regression tests pass. Do not create a fake synchronous `prepare().get()` compatibility shim.

## 3. Confirmed SQL and behavior incompatibilities

The following are confirmed in the inspected application source.

| Priority | Existing SQLite behavior | Source locations / frequency | Required MySQL treatment |
|---|---|---|---|
| Blocker | `GROUP_CONCAT(expression, ', ')` | `src/routes/messages.js` (2) | MySQL uses `GROUP_CONCAT(expression SEPARATOR ', ')`. Add a result-format regression test. |
| Blocker | `COLLATE NOCASE` | social, group and server queries | Replace with an explicit compatible MySQL collation or normalized comparison. SQLite NOCASE and MySQL Unicode collations are not identical. |
| Blocker | `datetime(...)` | group and moments routes | Rewrite comparisons using typed UTC DATETIME values and explicit MySQL expressions; preserve boundary behavior. |
| Blocker | `julianday(...)` and SQLite string concatenation with `||` | `src/server.js` reminder worker | Rewrite reminder-window arithmetic with MySQL date arithmetic and bound parameters. |
| High | `INSERT OR IGNORE` | 9 call sites across messages, groups, channels, social and server | Convert per statement to a targeted idempotent insert or explicit duplicate-key handling. Do not mechanically use broad `INSERT IGNORE`, which can suppress truncation/conversion errors. |
| High | `db.transaction(() => ...)` | 8 call sites | Use async transactions pinned to one connection; preserve atomicity across every statement. |
| High | `lastInsertRowid` | 20 call sites in the audited files | Use `insertId`; preserve safe integer/string semantics and API response types. |
| High | SQLite constraint error names | auth and group routes | Handle MySQL duplicate-key and foreign-key errors intentionally; preserve HTTP 409/400 behavior. |
| High | `.changes` result metadata | multiple routes and Socket.IO | Use `affectedRows` and test update semantics, including no-op updates. |
| Medium | `PRAGMA table_info`, `PRAGMA foreign_keys`, `PRAGMA journal_mode`, `sqlite_master` | `src/db.js` bootstrap | These are SQLite schema/bootstrap operations, not runtime MySQL SQL. Replace with explicit versioned migrations and MySQL metadata queries; never run SQLite bootstrap against MySQL. |

The application also uses SQLite positional `?` parameters. mysql2 supports positional placeholders, but dynamic `IN (...)` lists must continue to be generated only from validated array lengths, with values separately bound.

### Concurrency-sensitive paths requiring explicit tests

- Invitation redemption increments `use_count` and creates membership/request/event records. The transaction must prevent over-redemption when simultaneous requests approach the use limit.
- Join-request review and membership creation must remain atomic and handle two administrators or repeated submissions safely.
- Poll voting and idempotent membership/follow/receipt inserts must preserve their duplicate behavior under concurrent requests.
- Group event reminder delivery must claim each (event, user) pair once and create the notification in the same transaction.
- Message and group-message reaction toggles must not create duplicates during simultaneous requests.

## 4. Schema design review — decisions still open

The 29-table MySQL draft was created from `src/db.js` and passed the current disposable MySQL 8.0.36 creation test. The following decisions are not yet approved:

### 4.1 IDs and JavaScript representation

The draft uses `BIGINT UNSIGNED AUTO_INCREMENT` for identity keys. Before approving it:
- inspect the maximum and minimum IDs in a consistent export of the actual live SQLite database;
- verify every foreign-key column has exactly matching width and signedness;
- define one application policy for IDs returned by mysql2 and serialized through JSON;
- audit all `Number(...)`, `Number.isSafeInteger`, and arithmetic operations on IDs.

The adapter currently enables `supportBigNumbers: true` and `bigNumberStrings: false`. This needs an explicit test with values around JavaScript's `Number.MAX_SAFE_INTEGER`; do not assume all BIGINT values are safe JavaScript numbers.

### 4.2 Timestamp and timezone policy

The draft maps SQLite timestamp text to `DATETIME(3)` and sets UTC in the schema-validation session. The runtime pool's `timezone: "Z"` config controls driver conversion; it does not by itself guarantee the MySQL server session timezone is UTC.

Before data import:
- inspect real stored timestamp formats, including fractional seconds and any timezone suffixes;
- establish UTC at every MySQL connection/session, not only the DDL session;
- define a single conversion/serialization policy;
- test moments expiry, invitation expiry, group event reminders, and read/delivery receipts across boundaries and server restarts.

### 4.3 Username collation

SQLite `COLLATE NOCASE` is not equivalent to every MySQL case-insensitive collation. The draft selects `utf8mb4_0900_as_ci` for username uniqueness. Test case-only variants, ASCII and non-ASCII characters, and accent variants against the existing product's expected login/registration behavior before approving this choice.

### 4.4 Text limits and Unicode

The draft maps several SQLite TEXT fields to bounded VARCHAR columns. The limits generally follow application/schema checks, but the final review must confirm every field's maximum, emoji behavior, and whether MySQL's CHAR_LENGTH and SQLite's length semantics match the intended user-visible limit. Also verify token hashes, media paths and usernames against actual generated/stored values.

### 4.5 Index and constraint parity

The current smoke test confirms table count and selected behaviors; it is not a complete schema-parity test. A follow-up must compare, table by table:
- exact column names, order, nullability, defaults and generated columns;
- primary and unique keys;
- every named SQLite index and its column order;
- all foreign keys and ON DELETE actions;
- all CHECK constraints and their effective enforcement;
- self-referencing reply keys and nullable reviewer/actor keys.

The generated nullable marker for the pending-only unique key is a reasonable MySQL design and its current smoke test passes. It still needs concurrent-request tests and verification against every possible join-request status.

## 5. Adapter and dependency review

- `src/db-mysql.js` is deliberately isolated and not imported by the live application.
- It requires `mysql2/promise`, but `mysql2` is not currently listed in `package.json` and no corresponding lockfile update has been made. A clean install will therefore not support loading this adapter until the dependency and lockfile are committed together.
- Keep `multipleStatements: false`; retain parameterized queries.
- Keep DDL and data imports out of application startup.
- Validate the pool's connection/session timezone and BIGINT behavior before route integration.
- Add a graceful shutdown hook that closes the pool only after the application has stopped accepting requests and drained active work.

## 6. Test coverage gaps

The successful test output proves:
- MySQL server version 8.0.36 started and became healthy;
- the draft created 29 application tables;
- the current smoke-test assertions passed for pending-request uniqueness, historical requests, foreign keys and selected CHECK constraints.

It does **not** yet prove:
- exact column/index/constraint parity with SQLite;
- every CHECK constraint or every ON DELETE action;
- the application can connect using the adapter;
- any route or Socket.IO handler works against MySQL;
- timestamps, Unicode, large IDs, or result metadata are preserved;
- import/export integrity or production data compatibility.

## 7. Recommended remediation order

1. **Schema parity report:** mechanically compare SQLite's final table definitions and indexes with the MySQL draft; list every mismatch and resolve it before calling the DDL final.
2. **SQL compatibility register:** inventory each SQL statement and specify its tested MySQL equivalent, especially the confirmed items in Section 3.
3. **Adapter hardening:** add mysql2 and lockfile on this branch only; test pool connectivity, UTC session setup, BIGINT conversion, transactions, shutdown and error normalization.
4. **Route-by-route asynchronous refactor:** start with auth and direct messages, then groups, channels, social, moments, uploads, and finally Socket.IO/background workers. Keep each step independently testable.
5. **Feature regression:** add tests for every affected feature and concurrency-sensitive path before any data import rehearsal.

## 8. Data-dependent work that cannot be completed yet

No current, verified export of the live SQLite database is available in this audit context. The historical local recovery database is not confirmed as the live database. Therefore the following cannot be safely signed off yet:
- maximum IDs and integer range;
- actual username uniqueness/collation conflicts;
- real text/media-path lengths;
- timestamp formats and timezone distribution;
- orphaned or inconsistent relationships in existing data;
- per-table row counts and deterministic row digests.

Do not substitute the historical recovery file or the Supabase media archive for a current live database export.

## 9. Production safety gate

No production change is included in this audit. Do not change the live Render branch, environment variables, database endpoint, storage configuration, or deployment target. Production migration remains blocked until a current consistent live SQLite online backup, a tested restore/rollback procedure, a funded and persistent MySQL service, a full import rehearsal, complete application regression, and explicit cutover approval are all available.
