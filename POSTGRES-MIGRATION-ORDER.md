# Phase 49 — PostgreSQL migration chain audit

## Ordered migrations
1. `migrations/postgres/001_initial_schema.sql` — foundation schema (29 application tables).
2. `migrations/postgres/002_channel_message_interactions.sql` — additive channel message metadata, reactions, receipts, edit/delete and pin state.

Do not rewrite an already-applied migration. Future schema changes must be new, ordered migration files.

## Verification
The disposable PostgreSQL 16 test creates a legacy channel message before applying migration 002, verifies its content survives, applies migration 002 a second time, checks reaction/receipt uniqueness and consistency constraints, verifies media-type validation, checks the application table count, and confirms channel deletion cascades to interaction rows.

## Production safety
This is an audit and test only. It does not execute DDL against live Supabase, change the live app's database adapter, merge draft PRs, or deploy to Render. Before production migration, take a verified backup, review the exact SQL, rehearse against a restored copy, and define rollback/recovery steps.
