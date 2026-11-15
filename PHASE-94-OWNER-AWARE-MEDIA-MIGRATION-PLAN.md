# Phase 94 — owner-aware media migration plan

## Objective
Convert only confirmed Phase 93 object-key matches into a reviewed candidate mapping for the PostgreSQL waltajjii.media_objects table.

## Mappings
- users.avatar_path → profile, owner = users.id
- messages.media_path → message, owner = messages.sender_id
- group_messages.media_path → group, owner = group_messages.sender_id
- channel_messages.media_path → channel, owner = channel_messages.sender_id
- moments.media_path → moment, owner = moments.user_id

## Safety rules
- Requires a Phase 93 report and uses exact object-key matches only.
- Requires a positive owner ID, supported MIME type, and a positive size within the reviewed limits (2 MB profile; 10 MB other purposes).
- Deduplicates repeated references to the same object only when owner, purpose, bucket, MIME type, and size all agree.
- Blocks the complete plan if any missing, ambiguous, numeric-ID, external-URL, unsafe-path, unsupported-source, invalid-owner, unsupported-MIME, invalid-size, or conflicting-ownership issue remains.
- Never deletes or modifies storage objects, SQLite rows, PostgreSQL rows, or application routes.

## Output
The JSON plan contains candidate media_objects metadata records, their source references, blockers, and required human checks. It deliberately sets automaticWritesAllowed to false.

## Validation
CI uses synthetic SQLite snapshots and fixture inventories. It verifies exact mapping, unresolved-reference blocking, conflicting owners, MIME allow-list enforcement, and file-size constraints.

## Limitations
The report does not verify remote object bytes, ownership permissions in Supabase, file signatures, or object download availability. A real read-only bucket export and an authorized owner/content audit are still required before any disposable import.

## Safety
No live Supabase access, database write, Render change, deployment, or production migration occurs in this phase.
