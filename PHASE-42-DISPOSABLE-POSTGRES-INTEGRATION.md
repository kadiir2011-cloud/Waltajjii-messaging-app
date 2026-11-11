# Phase 42 — Disposable PostgreSQL integration

## Purpose

Execute the draft PostgreSQL DDL against a fresh, disposable PostgreSQL 16 service in GitHub Actions, then verify the resulting catalogs and representative database behavior.

## Isolation and safety

- The workflow provisions its own ephemeral PostgreSQL service container for the CI job.
- The database is named `waltajjii_test` and uses synthetic CI-only credentials.
- The test connection is provided only through `TEST_DATABASE_URL` in the workflow job environment.
- No Supabase project, Render service, production database, or user data is referenced.
- The workflow does not create or change repository secrets.
- The DDL is executed only in the disposable CI service.
- All synthetic application rows are wrapped in a transaction and rolled back.
- No application runtime code, Render configuration, Supabase configuration, merge, or deployment is changed.

## What the integration test verifies

1. The complete draft migration executes successfully on PostgreSQL 16.
2. Exactly the 29 application tables are created inside the isolated `waltajjii` schema, with none of those tables created in `public`.
3. Standalone entity IDs are PostgreSQL BIGINT identity columns.
4. Timestamp columns use `TIMESTAMPTZ`.
5. The case-insensitive username index exists.
6. The composite poll-vote foreign key exists and prevents a vote from pairing a poll with another poll's option.
7. Synthetic inserts exercise generated IDs, case-insensitive username uniqueness, body-length checks, foreign-key integrity, and rollback.
8. Foreign-key and index catalogs contain the expected relational structures.

## Limits

This is a schema/integration foundation test, not a migration of SQLite data and not proof that every route, Socket.IO event, or reminder worker is PostgreSQL-ready. The current app continues to use SQLite. Real source-data preflight, route conversion, and end-to-end parity remain separate gated phases.

## Acceptance

Phase 42 is complete only when the GitHub Actions PostgreSQL service job passes. Any SQL failure must be corrected in the draft schema or documented as a blocker; do not bypass failing assertions.
