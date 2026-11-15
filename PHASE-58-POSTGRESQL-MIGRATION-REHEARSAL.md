# Phase 58 — Disposable PostgreSQL migration rehearsal

## Purpose

Prove that the current SQLite application's 29 tables can be copied into a freshly migrated PostgreSQL schema, with source rows preserved and checked, before any real user database is considered.

## Safety gates

The importer:
- Requires an explicit allowDisposableTarget opt-in (CLI: WALTAJJII_ALLOW_DISPOSABLE_TARGET=1).
- Requires the PostgreSQL database name to contain test, rehearsal, or disposable.
- Requires the destination application tables to be empty; it never truncates or overwrites data.
- Opens SQLite read-only.
- Imports inside one PostgreSQL transaction and rolls back on any error.
- Does not connect to Supabase Storage, Render, or the production application.
- Does not create schemas or execute migrations; reviewed migrations must already have been applied to a disposable database.
- Refuses unmapped source columns, missing destination tables, non-nullable dependency cycles, and required destination columns without a source/default.

Do not set the opt-in variable for a production database. The database-name check is an additional safeguard, not a substitute for using an isolated disposable database.

## Run in CI

The Phase 58 GitHub Actions workflow starts a fresh PostgreSQL 16 service, applies migrations 001–003, creates a temporary SQLite database by running the current src/db.js schema, seeds representative rows across all 29 application tables, then runs the importer.

The test verifies:
- All 29 SQLite application tables are represented.
- Source and destination row counts match.
- A SHA-256 digest of normalized row values matches for every table.
- Self-referencing message replies and cross-table relationships survive.
- Poll votes, group/channel memberships and message interactions survive.
- PostgreSQL identity sequences advance beyond imported IDs.
- A second import refuses to mix data into non-empty target tables.
- Production-like database names are rejected before writes.

## Local rehearsal

Only use a new disposable PostgreSQL database whose name contains test, rehearsal, or disposable. Apply the reviewed SQL migrations 001, 002 and 003 to that database first. Then:

    set WALTAJJII_ALLOW_DISPOSABLE_TARGET=1
    set WALTAJJII_REHEARSAL_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/waltajjii_rehearsal
    node scripts/phase58-postgres-migration-rehearsal.js "C:\path\to\copy-of-waltajjii.db"

The database URL is a secret. Keep it in a local environment or secret manager; never paste it into chat or commit it. For TLS, set PGSSL=true; certificate verification remains enabled.

## Data and media boundaries

- PostgreSQL BIGINT values are handled as strings during parity checks.
- Legacy SQLite timestamps without an offset are interpreted as UTC when copied to TIMESTAMPTZ.
- PostgreSQL-only media_objects rows are not fabricated. Existing media references are copied as metadata references only; the existence, ownership and access of actual objects in the private Supabase Storage bucket require a separate reconciliation process.
- Channel interaction tables that exist only in PostgreSQL remain empty when no corresponding SQLite tables exist.
- In-memory presence and active WebRTC sessions are not persistent SQLite records and are not migrated.

## Completion criteria and remaining launch work

A passing CI rehearsal validates the migration mechanism against a controlled fixture dataset. It does not mean the user's actual SQLite database has been inspected or migrated, and it does not authorize cutover.

Before public launch, still require:
1. A verified backup of the actual SQLite database and any local fallback uploads.
2. A read-only Phase 57 report from a copy of the actual database.
3. A full staging rehearsal using a protected backup copy and the actual production schema/data.
4. A private Supabase Storage object inventory and reconciliation of every media reference, including orphan and missing objects.
5. Authentication, API, Socket.IO, browser E2E, reminder worker, load, security and monitoring validation against staging.
6. A documented restore and rollback rehearsal, followed by explicit approval before any production changes.

No Supabase DDL, production data writes, Render changes, merges or deployment are included in Phase 58.
