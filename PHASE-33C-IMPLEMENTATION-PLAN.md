# Phase 33C — Next implementation checkpoint

## Completed
- PostgreSQL adapter with parameterized query helpers and transaction handling.
- Pool configuration validation with a low connection ceiling, TLS verification, and the isolated `waltajjii,public` search path.
- Mock-based unit tests for both components.
- CI workflow runs both test files on Node 22.

## Verified
GitHub Actions run 42854174082 completed successfully:
https://github.com/kadiir2011-cloud/Waltajjii-messaging-app/actions/runs/42854174082

## Current boundary
This is still an isolated foundation. It does not connect to Supabase and is not imported by the running app. No `pg` package has been added, no `DATABASE_URL` has been configured, no SQL migration has been run, and no Render deployment has been triggered.

## Next implementation sequence
1. Add and lock the `pg` driver using npm so package.json and package-lock.json remain consistent.
2. Add an explicit opt-in pool factory with safe shutdown and connection smoke-test command.
3. Add isolated PostgreSQL integration tests using a disposable test database/schema; never point those tests at the user's production Supabase project.
4. Implement a separate PostgreSQL authentication/profile router and test it without replacing the SQLite router.
5. Only after integration tests pass, plan a controlled test-service switch.

## Important
The existing app continues to use synchronous SQLite throughout routes and Socket.IO. Do not set `DATABASE_URL`, execute the saved Supabase DDL, or change Render service settings as part of this checkpoint.
