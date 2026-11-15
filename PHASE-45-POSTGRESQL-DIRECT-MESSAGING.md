# Phase 45 — PostgreSQL direct messaging

## Scope

Adds an isolated asynchronous PostgreSQL service and Express router for direct messages. It covers user discovery, message creation (including media metadata and replies), conversation history, aggregated emoji reactions, read receipts, per-user hiding, sender-only deletion for everyone, sender-only text editing, and forwarding.

## Compatibility and safety

- The live SQLite router remains mounted in the current application; this PostgreSQL router is not mounted in `src/server.js`.
- All IDs are passed to PostgreSQL as decimal strings, avoiding unsafe JavaScript Number conversion of BIGINT values.
- Message creation, reply validation, forwarding, reaction toggling, read-receipt updates, and deletion use database transactions where multi-step consistency is needed.
- User-facing errors retain the existing HTTP status and message contract for the covered routes.
- Socket.IO events are emitted only after successful database operations.
- Media files are not uploaded by this phase; it stores and returns the existing media path/type metadata, relying on the separate storage workflow.

## Automated verification

The Phase 45 GitHub Actions workflow provisions a disposable PostgreSQL 16 service, applies the draft schema only to that service, seeds three synthetic users, and exercises the HTTP endpoints. The test covers authentication, user listing, send/reply, conversation retrieval, reaction toggle, edit authorization, forwarding, read receipts, per-user hiding, and sender-only delete-for-everyone.

## Not included

No production database connection, Supabase SQL execution, data migration, Render environment change, runtime switch, merge, or deployment. Group/channel/social/moments/upload routes and the event reminder worker still require PostgreSQL conversion and regression coverage before production activation.
