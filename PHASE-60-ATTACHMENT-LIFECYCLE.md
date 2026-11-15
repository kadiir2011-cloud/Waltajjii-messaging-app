# Phase 60 — PostgreSQL message attachment lifecycle

## What changed

- Direct-message, group-message and channel-message attachment references are detached on global deletion.
- Per-user direct-message hiding does not detach media.
- Media rows are locked while direct/group/channel messages attach media and while direct messages are forwarded. Moment creation also locks the owned media row.
- A shared media object is retained while any active direct, group, channel or unexpired Moment reference exists.
- When the final live reference disappears, the media object is marked unavailable and a durable cleanup record is inserted in the same PostgreSQL transaction.
- Supabase Storage deletion is retried from the queue. Failed removals increment an attempt counter and preserve a bounded error message; concurrent workers claim work using `FOR UPDATE SKIP LOCKED`. Claims older than five minutes are treated as abandoned and become eligible for retry after a worker crash.

## Migration

Apply `migrations/postgres/004_media_storage_cleanup.sql` after migrations 001–003 in a disposable/staging PostgreSQL database. Do not apply it to the live Supabase project until the controlled staging migration gate is approved.

## Worker lifecycle

Create the media storage service and pass it to `createPostgresMediaCleanupWorker` from `src/workers/postgres-media-cleanup-worker.js`. Start it only after the PostgreSQL pool and media storage client are ready. Stop it during graceful shutdown before closing the pool. The worker prevents overlapping runs within one process; the database queue supports multiple processes through row-level skip-locked claims.

The helper is not started by the current SQLite production server. Runtime wiring is part of the later controlled PostgreSQL cutover, not this isolated PR.

## Safety boundaries

- PostgreSQL API composition remains opt-in.
- No live Supabase DDL or Storage objects were changed.
- No Render configuration, disk, environment variables, deploys or service restarts were changed.
- No PR was merged and no production runtime switch was made.
