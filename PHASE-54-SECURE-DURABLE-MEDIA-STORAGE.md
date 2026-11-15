# Phase 54 — Secure and durable media storage

## Scope
This phase introduces an isolated PostgreSQL media-object registry and a server-side Supabase Storage service. It is deliberately not mounted into the live SQLite application and does not change the current upload routes.

## Security and durability decisions
- Store objects in the existing private `waltajjii-media` bucket; never make the bucket public.
- Use the server-side Supabase service credential only. Never expose it to browser code.
- Store objects under an owner-scoped random key (`<owner-id>/<uuid>.<extension>`); never accept client-supplied object keys or paths.
- Validate MIME allow-list and actual buffered byte length. Profile images are limited to 2 MB; other supported media are limited to 10 MB.
- Persist owner, purpose, bucket, object key, MIME type and byte count in `waltajjii.media_objects`.
- Compensate for a metadata-insert failure by attempting to remove the just-uploaded object.
- Enforce owner-only metadata lookup/removal in this foundation service. Shared message/group/channel/moment reads must additionally pass their parent-record membership/visibility authorization before delivery.
- No public URLs or signed URLs are issued by this phase.

## Files
- `migrations/postgres/003_media_objects.sql`
- `src/services/postgres-media-storage-service.js`
- `test/phase54-postgres-media-storage.test.js`
- `.github/workflows/phase54-postgres-media-storage.yml`

## Explicitly not done
- No route mounting, frontend upload changes, existing SQLite route changes, data migration, or live Supabase bucket/policy changes.
- Existing legacy media columns still store filename/path values and are not automatically converted to media-object IDs.
- No automatic orphan-object reconciliation job is enabled.

## Validation
The GitHub Actions job runs against disposable PostgreSQL 16 and a fake Supabase Storage client. It validates schema creation, upload metadata, download bytes, owner isolation, MIME and size rejection, and object removal. A passing CI run does not claim a live Supabase integration test.
