# Phase 92 — verified snapshot to disposable PostgreSQL rehearsal

## Objective
Connect the Phase 91 verified snapshot workflow to the existing Phase 58 transactional SQLite-to-PostgreSQL rehearsal, so an import cannot begin until the snapshot manifest, SQLite checksum, table counts, integrity checks, and optional local-media checks have passed.

## Workflow
1. An authorized operator creates a Phase 91 snapshot in a controlled environment.
2. Phase 92 verifies the snapshot manifest and every recorded SHA-256 checksum.
3. Only after verification does it call the Phase 58 migration rehearsal.
4. Phase 58 enforces an explicit disposable-target flag, a test/rehearsal/disposable database name, a pre-created target schema, and empty target tables.
5. Phase 58 imports transactionally, checks row counts and row-level hashes, and rolls back if validation fails.

## Example (isolated rehearsal only)

    WALTAJJII_ALLOW_DISPOSABLE_TARGET=1 WALTAJJII_REHEARSAL_DATABASE_URL=postgresql://... node scripts/phase92-verified-snapshot-postgres-rehearsal.js /secure/backup/snapshot/manifest.json

Use a disposable PostgreSQL database only. Never set the disposable-target flag for a production database.

## Validation
The CI test builds a complete synthetic SQLite application database using the repository schema, creates a Phase 91 snapshot, applies the reviewed PostgreSQL migrations to an ephemeral PostgreSQL 17 service, verifies the snapshot, and imports it through the Phase 58 rehearsal. It checks table counts and rejects a tampered snapshot before opening a PostgreSQL connection.

## Limitations
- CI uses synthetic fixture data, not the actual Waltajjii user database.
- No Render connection, Supabase connection, production database, or real user media is accessed.
- Remote Supabase Storage objects remain outside this rehearsal; the Phase 58 report records mediaObjectsImported as zero.
- A passing rehearsal is not evidence that production data has been backed up or restored.
- No production schema, environment variable, deployment, or application runtime is changed.

## Safety
Draft review only. No merge or deployment. The source snapshot is opened read-only by the migration rehearsal and the PostgreSQL target must be empty and clearly identified as disposable.
