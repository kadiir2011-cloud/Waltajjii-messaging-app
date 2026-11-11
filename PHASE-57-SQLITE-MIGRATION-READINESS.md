# Phase 57 — SQLite-to-PostgreSQL migration readiness

## Scope

Phase 57 adds a read-only preflight for the existing Waltajjii SQLite database. It does not migrate records, execute PostgreSQL DDL, alter Supabase, change Render, or switch the application runtime.

## Checks

- SQLite integrity and foreign-key checks.
- Presence of core user, direct-message, group, membership and group-message tables.
- Per-table row counts and maximum IDs, represented safely as strings.
- Negative IDs, blank usernames and case-insensitive username collisions.
- Invalid non-empty values in recognized timestamp columns.
- Media-reference inventory: numeric IDs, path-like references and opaque references.

The report does not print usernames, message bodies, password hashes, media object keys or other user content.

## Run locally

Use a copy of the database, not the only backup. The script opens SQLite in read-only mode:

    node scripts/phase57-sqlite-migration-preflight.js "C:\path\to\waltajjii.db"

Or set WALTAJJII_SQLITE_PATH. To save a new report file (the destination must not already exist):

    node scripts/phase57-sqlite-migration-preflight.js "C:\path\to\waltajjii.db" --out "C:\path\to\phase57-report.json"

Exit codes: 0 means no blockers and ready for a controlled rehearsal; 1 means command/file error; 2 means data-readiness blockers. A clean report is not approval for production cutover.

## Interpretation

- Media inventory does not prove that each object exists or is accessible in the private Supabase bucket.
- The preflight does not verify PostgreSQL privileges, connectivity, migration rollback or full data parity.
- SQLite usernames use COLLATE NOCASE UNIQUE; PostgreSQL's unique index on LOWER(username) is intended to preserve that behavior. The audit independently checks for legacy collisions.
- Preserve PostgreSQL BIGINT IDs as strings in JavaScript. Interpret legacy naive SQLite timestamps as UTC; use Africa/Addis_Ababa for presentation/input.

## Safety

No production database writes, Supabase DDL, storage changes, Render changes, runtime changes or merges are part of Phase 57.
