# Phase 79 — disposable PostgreSQL integration CI

## Objective
Turn the existing PostgreSQL schema, route/service, realtime, and SQLite migration rehearsal tests into an automatically exercised CI gate using a disposable PostgreSQL 17 service.

## Delivered
- Provision a fresh PostgreSQL 17 service container for each GitHub Actions run.
- Set `TEST_DATABASE_URL` only to the ephemeral CI database named `waltajjii_test`.
- Install the native SQLite driver so SQLite preflight and migration-rehearsal fixtures can run.
- Run the repository's Node test files serially (excluding only the browser automation test, which requires its own browser setup).
- Syntax-check JavaScript under `src`, `public`, `test`, and `scripts`.

## Safety controls
- No production Supabase URL or credentials are used.
- The PostgreSQL instance is created by GitHub Actions and discarded after the job.
- The migration rehearsal's disposable-database guard remains enabled.
- Tests run serially because several integration suites reset the isolated `waltajjii` schema.
- The workflow does not connect to Render or change any deployment environment.

## Remaining test boundary
- `phase56-browser-e2e.test.js` is intentionally excluded until a dedicated Playwright browser installation job is configured.
- A passing CI database job does not authorize applying migrations to Supabase, importing real user data, or switching the live application to PostgreSQL.
- The running application still uses synchronous SQLite call sites; the Postgres adapter and route/service modules are not yet wired into the live runtime.

## Acceptance
A successful run must complete dependency installation, syntax checks, and all non-browser Node test files against the disposable PostgreSQL service. Any failure must be fixed or explicitly classified before a production migration is considered.
