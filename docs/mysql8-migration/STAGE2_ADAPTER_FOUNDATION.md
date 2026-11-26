# Stage 2 — MySQL 8 adapter foundation

**Branch:** `waltajjii-mysql8-migration-preparation`  
**Scope:** isolated adapter contract and test foundation only  
**Production safety:** `src/server.js` continues to use the existing SQLite database module. This Stage 2 work does not switch the app, change Render, or access production data.

## Implemented

- Dependency-injected `createMySqlAdapter({ mysql, env })` in `src/db-mysql.js`.
- Async `query`, `execute`, `ping`, `withTransaction`, and `close` methods.
- Each physical pooled connection receives `SET time_zone = '+00:00'` before application SQL.
- Transactions pin all statements to one acquired connection and perform rollback on failure.
- `BIGINT` values are configured as strings to avoid JavaScript precision loss.
- `normalizeInsertId` and narrowly scoped duplicate-key classification helpers.
- UTF-8 (`utf8mb4`), parameterized execution, multi-statements disabled, bounded pool configuration, and optional verified TLS.
- Unit tests with a fake driver for configuration, UTC initialization, transaction commit/rollback, BIGINT handling, duplicate-key classification, and pool shutdown.
- Guarded real-server integration test requiring `MYSQL_TESTS=1`, a local MySQL host, and database name exactly `waltajjii_migration_test`. It checks MySQL 8.0.36, UTC session timezone, BIGINT round-trip, duplicate-key handling, and transaction rollback.

## Test commands

Unit tests (no database credentials or MySQL server required):

```powershell
npm run test:mysql8:adapter
```

Real MySQL integration test (only against the disposable local validation database):

```powershell
$env:MYSQL_TESTS = "1"
npm run test:mysql8:integration
Remove-Item Env:MYSQL_TESTS
```

The integration test deliberately skips unless the safety guards pass. Set the existing local `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` environment variables in the local PowerShell session; do not paste credentials into chat.

## Known blockers / not yet implemented

1. `package.json` includes `mysql2`, but `package-lock.json` has not yet been regenerated with that dependency. Before a clean `npm ci`, run `npm install --package-lock-only --ignore-scripts` in the local migration-branch checkout and commit the resulting lockfile on this branch.
2. No Express route or Socket.IO handler has been converted yet. The application still has synchronous SQLite access and must not be pointed at MySQL.
3. The adapter contract is now asynchronous; route modules must be migrated in small feature groups, with all call sites awaited and all transaction statements using the provided `tx.query` / `tx.execute` methods.
4. No claim is made that the real MySQL integration test has passed until it is run against the local 8.0.36 validation container and its output is reviewed.

## Next implementation order

1. Regenerate and commit the package lock; run the adapter unit and real MySQL integration tests.
2. Add a separately selectable MySQL app bootstrap that is not imported by the production SQLite entry point.
3. Convert authentication/profile routes as the first vertical slice, preserving HTTP responses and JWT behavior.
4. Add route-level tests, then migrate messages, groups, channels, social, moments, uploads, and Socket.IO/background jobs in separate slices.
5. Keep production migration blocked until complete application regression, verified live SQLite backup, data rehearsal, and explicit cutover approval.
