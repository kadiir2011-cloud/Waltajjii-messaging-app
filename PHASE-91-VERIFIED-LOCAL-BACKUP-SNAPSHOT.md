# Phase 91 — verified local backup snapshot

## Objective
Provide a safe, repeatable way to create and verify a consistent SQLite snapshot and an optional local-media copy before any future migration work.

## What the tool does
- Opens the SQLite source read-only and checks integrity_check and foreign_key_check.
- Uses the SQLite online backup API through better-sqlite3 to create a consistent snapshot, including a database using WAL mode.
- Reopens the copied database read-only, repeats integrity and foreign-key checks, and compares per-table row counts with the source.
- Optionally copies a local media directory, rejects symbolic links and unsupported filesystem entries, and checks SHA-256 hashes after copying.
- Writes a manifest containing the database hash, table row counts, and local-media file inventory.
- Provides a separate verification mode that recomputes the database and media hashes and checks the recorded row counts.
- Refuses to overwrite an existing output directory.

## Usage (only in a controlled environment with an authorized backup operator)

Create a snapshot:

    node scripts/phase91-verified-local-backup-snapshot.js --db /secure/path/waltajjii.db --media-dir /secure/path/uploads --out /secure/backup/waltajjii-snapshot-YYYYMMDD

Verify it:

    node scripts/phase91-verified-local-backup-snapshot.js --verify /secure/backup/waltajjii-snapshot-YYYYMMDD/manifest.json

The output directory must be new. Protect it as sensitive personal data, encrypt it at rest and in transit, restrict access, and copy it to a separate backup location with an independent retention policy.

## Explicit limitations
- This is a local SQLite snapshot utility; it does not connect to Render, inspect or download the live production database, or run automatically against a production service.
- The optional media copy covers only a local directory. It does not enumerate, download, modify, or verify remote Supabase Storage objects.
- A manifest and matching hashes prove file consistency relative to this snapshot, not that an off-site backup exists or can be restored operationally.
- This phase does not provision PostgreSQL, import data, execute SQL migrations, change environment variables, or authorize a production cutover.
- Before any migration, an authorized operator must obtain an approved snapshot of the actual source, securely transfer it, restore it into an isolated target, and compare all tables, relationships, identity values, and media object references.

## Validation
Run node --test test/phase91-verified-local-backup-snapshot.test.js.

CI uses temporary synthetic databases and fixture media only. It does not access user data or production services.

## Safety
No production source runtime, Render service, Supabase project, environment setting, or live database is changed. This is a draft pull request for review only.
