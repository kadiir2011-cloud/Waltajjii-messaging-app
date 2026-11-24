# Waltajjii MySQL 8 Migration Preparation

## Status and safety boundary

- Preparation branch: `waltajjii-mysql8-migration-preparation`
- Base branch: `waltajjii-phase111-restore-teal-workspace`
- Application: Express.js / Node.js 22
- Current database implementation: SQLite via `better-sqlite3`
- Intended target: MySQL Community Server 8.x, isolated private Render service
- This branch is not configured as the live Render service's deploy branch.
- No Render service, disk, database, credential, or production setting is created or changed by this preparation.
- No production data is copied or modified.

## Repository inspection findings

The current `src/db.js` defines 29 application tables and 28 named indexes. The tables cover:

- Accounts and direct messaging: `users`, `messages`, `message_reactions`, `message_hidden_for`
- Groups and group collaboration: `groups`, `group_members`, `group_messages`, `group_message_reactions`, `group_message_receipts`, `group_invitations`, `group_invitation_events`, `group_join_requests`, `group_activity`, `group_polls`, `group_poll_options`, `group_poll_votes`, `group_events`, `group_event_rsvps`, `group_event_reminder_deliveries`
- Channels: `channels`, `channel_members`, `channel_messages`
- Social and ephemeral content: `follows`, `connection_requests`, `posts`, `post_likes`, `post_comments`, `notifications`, `moments`

Database access is spread across the authentication, messages, groups, channels, social, moments and uploads route modules. The existing implementation depends heavily on synchronous `db.prepare(...).get/all/run`, `db.transaction(...)`, SQLite positional `?` placeholders, SQLite result metadata such as `lastInsertRowid`, and SQLite-specific SQL.

The repository also contains a SQLite preflight script and a PostgreSQL migration rehearsal. The PostgreSQL rehearsal is not a MySQL migration and must not be reused as if it were one.

## Critical compatibility work

A MySQL driver cannot be substituted directly for `better-sqlite3`: the current route handlers expect synchronous query results, whereas the standard Node.js MySQL driver is asynchronous. A safe MySQL implementation therefore requires a deliberate data-access refactor and route-by-route regression tests.

The migration must explicitly address:

1. Async query and transaction handling throughout every route and Socket.IO database access.
2. MySQL 8 schema design: integer identity keys, unsigned/signed compatibility, text lengths, timestamps, defaults, collations, unique and composite indexes, foreign keys and delete behavior.
3. Case-insensitive username uniqueness (currently SQLite `COLLATE NOCASE`) with a deliberate MySQL collation.
4. SQLite-only SQL such as `INSERT OR IGNORE`, `datetime(...)`, `PRAGMA`, and partial unique indexes. MySQL equivalents must preserve behavior, not merely make queries parse.
5. Insert identifier handling (`lastInsertRowid` versus MySQL insert result `insertId`).
6. Boolean/integer normalization and timestamp/time-zone behavior.
7. Safe handling of nullable/self-referential foreign keys and import order.
8. Preservation of every existing table, row, relationship, and index, including group events, polls, invitation state and message receipts.
9. Media references: keep Supabase Storage objects and references intact; do not re-upload, rename or delete objects during database migration.

## Required implementation sequence

### A. Schema inventory and design
- Extract the complete live-branch schema and all route SQL.
- Produce reviewed MySQL 8 DDL for all 29 tables and required indexes.
- Record every SQLite-specific query and its tested MySQL equivalent.
- Confirm key widths, collations, timestamp policy and foreign-key behavior.

### B. Isolated data-access implementation
- Add a separate MySQL connection/pool module and explicit environment-variable validation.
- Refactor database calls to asynchronous operations in small, reviewable groups.
- Keep the SQLite implementation available on the preparation branch until parity testing is complete.
- Never place credentials in source control or chat.

### C. Disposable MySQL 8 rehearsal
- Use only a clearly disposable, empty MySQL database.
- Require an explicit safety flag and verify target server/database identity before any import.
- Read the SQLite source through a consistent SQLite online backup snapshot; do not copy a live WAL database file directly.
- Import in foreign-key-safe order, preserve primary keys, and restore auto-increment counters.
- Compare per-table row counts and deterministic SHA-256 row digests; run MySQL foreign-key checks and application-level tests.
- A failed rehearsal must roll back or leave the disposable target clearly marked for discard.

### D. Application regression
- Test registration/login, profile updates, direct messages, replies/reactions, delivery/read receipts, media references, groups, membership and invitations, polls, events, channels, social feed, notifications, moments, uploads and Socket.IO presence/call state.
- Verify concurrency-sensitive transactions and duplicate-request behavior.
- Run clean-install and restart tests against MySQL 8.

### E. Production-readiness gate (not authorized yet)
Production migration cannot begin until all of the following are true:
- A verified, current SQLite online-backup export from the actual live service is available.
- A restorable pre-migration backup and tested rollback procedure exist.
- The MySQL service and persistent disk are funded and provisioned in the same Render region as the app.
- Disposable rehearsal and full regression tests pass.
- A maintenance/cutover window is agreed.
- The owner explicitly approves production cutover.

## Non-goals for this preparation stage

- Do not modify the current live Render service or its environment variables.
- Do not point the live app at MySQL.
- Do not deploy this branch to production.
- Do not create paid Render resources or persistent disks.
- Do not claim the historical local SQLite recovery file is the current live database.
- Do not treat the verified Supabase media archive as a database backup.

## Current blockers

1. Render MySQL 8 service and persistent disk require funding; no paid resource is to be created until funding is available and the exact current price is confirmed.
2. A current live SQLite export is not yet available. The historical local recovery copy is not verified as the live database.
3. The current app uses synchronous SQLite access across many route handlers; the asynchronous MySQL refactor and tests are still required.
