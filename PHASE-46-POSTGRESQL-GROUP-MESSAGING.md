# Phase 46 — PostgreSQL group messaging

## Scope

Adds a separate asynchronous PostgreSQL service and Express router for group creation/listing, member discovery and admin member addition, group chat history, sending messages and media metadata, replies, announcements, delivery/read receipts, emoji reactions, sender-only editing, sender/admin deletion, and admin pin/unpin.

## Safety and compatibility

- This router is not mounted in the current SQLite application. The live service remains unchanged.
- BIGINT identifiers are passed through as decimal strings; no JavaScript Number coercion is used for database IDs.
- Group creation and membership creation, message creation and receipt fan-out, reaction toggles, and message updates use PostgreSQL transactions.
- Membership and admin authorization are checked inside the service before group content or mutations are returned.
- Socket.IO notifications occur only after successful database writes.
- Media upload itself remains the responsibility of the existing storage pipeline; this phase accepts only existing media path/type metadata.

## Verification

A dedicated GitHub Actions workflow starts a disposable PostgreSQL 16 database, applies the draft schema there, inserts synthetic test users, and exercises the new HTTP router. It tests authentication, group creation, membership visibility and admin-only member addition, admin-only announcements, group messages and replies, delivery receipts, reactions, edit permissions, pin/unpin permissions, deletion permissions, and message read behavior.

## Not included

No production Supabase connection, live schema execution, Render changes, data migration, runtime switch, merge, or deployment. Group administration features outside the covered operations (invitations, join approval, role management, polls, events, and activity history) remain for later phases.
