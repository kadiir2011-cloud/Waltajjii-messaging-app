# Phase 95 — read-only private Storage inventory export

## Objective
Provide an operator-run, read-only exporter for the existing Waltajjii Storage bucket so Phases 93–94 can be run against a real inventory without sharing credentials or changing bucket contents.

## What it does
- Uses the server-side Supabase key from local environment variables only.
- Verifies that the requested bucket exists and records whether it is public or private.
- Recursively lists root and nested folders with pagination.
- Exports object key, byte size, MIME metadata, last-modified metadata, and ETag when available.
- Writes a new JSON file with restrictive file permissions and refuses to overwrite an existing file.
- Enforces page, folder and object-count safety limits.

## Local use (PowerShell)

Set the values in your local shell using your secure secret store; do not paste credentials into chat, source code, GitHub, or the inventory file:

    $env:SUPABASE_URL = "<your project URL>"
    $env:SUPABASE_SERVICE_ROLE_KEY = "<server-only key>"
    $env:SUPABASE_STORAGE_BUCKET = "waltajjii-media"
    node scripts/phase95-readonly-storage-inventory-export.js .\waltajjii-storage-inventory.json

The exporter also accepts SUPABASE_SECRET_KEY if that is the server-only key name already used by your environment. Keep the generated inventory private because object names can contain personal information.

## Read-only guarantees
The code calls only bucket metadata lookup and object-list operations. It does not call upload, remove, move, copy, update, or policy mutation methods. It never prints the key. If the bucket is public, the report records that fact but does not change it.

## Validation
CI uses a mocked Storage client to test pagination, nested folders, MIME/size metadata, public/private reporting, errors, and unsafe path rejection. CI does not connect to Supabase.

## Safety
No live bucket was accessed by CI or this development phase. No Supabase policy, object, database, Render setting, or application runtime is changed. This tool is for an authorized operator to run locally.
