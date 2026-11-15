# Phase 96 — Staging integration and release safety

## Objective
Prepare a safe, testable path from the cumulative Phase 95 development branch toward a staging release without changing the live Waltajjii service or production data.

## Included in this phase
- Move the PostgreSQL Moment media ownership row lock, Moment insert, and owner lookup into one PostgreSQL transaction.
- Extend unit coverage to verify that the ownership lock and insert use the same transaction callback and that an ownership failure aborts the transaction.
- Add an explicit staging/release gate that documents the remaining runtime integration work.

## Critical architecture finding
The cumulative branch contains a PostgreSQL API router and PostgreSQL services, but `src/server.js` remains the SQLite production composition. The PostgreSQL adapter itself explicitly states that it is not wired into the running app because the current routes and Socket.IO handlers still use synchronous SQLite access.

Therefore:
- This phase does **not** switch the app to PostgreSQL.
- Merging the cumulative integration PR alone must not be treated as a PostgreSQL runtime cutover.
- A separate, comprehensive migration of every route, Socket.IO handler, background task, session/auth path, and deployment configuration is required before any PostgreSQL production cutover.
- The existing SQLite runtime remains the production behavior until a separately reviewed release authorizes a cutover.

## Staging gates
Before staging can be called verified:
1. Provision an isolated staging service and isolated database; never point tests at production.
2. Confirm schema migrations apply cleanly to an empty disposable PostgreSQL database.
3. Run the full PostgreSQL integration and browser regression suites.
4. Verify auth/session lifecycle, messaging, group/channel permissions, media upload/download/deletion, Moment ownership, presence, calls, translation, AI, and mobile UI.
5. Verify Supabase Storage bucket access and policies using non-production credentials and test objects.
6. Confirm logs, health checks, rate limits, backups, restore rehearsal, and rollback procedure.
7. Record exact staging commit, service, database, test run URLs, and sign-off.

## Production safety
- No Render configuration, deployment, environment variable, Supabase project, production database, Storage object, or production data is changed by this phase.
- Do not run Phase 91–95 migration/backup tools against production without a separate explicit approval and verified backups.
- Do not merge or deploy this phase until required checks and human review are complete.
