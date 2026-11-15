# Phase 93 — media object inventory and reconciliation

## Objective
Identify which legacy SQLite media references can be matched to a read-only export of the private Supabase Storage bucket before any media migration or cleanup is attempted.

## What it does
- Requires and verifies a Phase 91 snapshot before reading its SQLite database.
- Discovers legacy avatar/media/file/object reference columns and primary keys.
- Reads a supplied JSON inventory export for the configured bucket (default: waltajjii-media).
- Reports exact key matches, missing references, ambiguous suffix candidates, numeric media IDs, external URLs, unsafe paths, and unreferenced storage objects.
- Writes an optional JSON report without changing the snapshot, database, or storage bucket.

## Inventory format

Export a read-only listing of bucket objects to JSON, for example:

    {
      "bucket": "waltajjii-media",
      "objects": [
        { "name": "avatar-uuid.jpg", "metadata": { "size": 12345, "mimetype": "image/jpeg" } },
        { "name": "owner-id/message-uuid.mp4", "metadata": { "size": 98765, "mimetype": "video/mp4" } }
      ]
    }

## Usage

    node scripts/phase93-media-object-reconciliation.js --snapshot-manifest /secure/backup/manifest.json --storage-inventory /secure/audit/storage-inventory.json --out /secure/audit/media-reconciliation.json

## Safety and interpretation
- The inventory must be exported separately by an authorized operator. This script does not connect to Supabase, request credentials, or read/write remote objects.
- Only exact object-key matches count as confirmed. A unique suffix match is a possible candidate; multiple suffix matches are ambiguous and are never auto-mapped.
- Unreferenced objects are not automatically deleted. They may be retained for legal, audit, retention, or recovery reasons.
- The report does not prove that an object can be downloaded, that its content matches its MIME type, or that the owner and viewer authorization rules are correct.
- The script never modifies SQLite, PostgreSQL, Supabase Storage, or the live application.

## Validation
CI uses a synthetic SQLite snapshot and a fixture object inventory. It covers exact matches, missing references, ambiguous suffixes, orphan objects, unsafe keys, duplicate keys, and tampered snapshots.

## Next gate
After the actual private bucket inventory is exported and reconciled, implement a separately reviewed, owner-aware migration plan. Do not delete or rewrite objects until every reference, owner, purpose, content hash, and restore path has been reconciled and approved.
