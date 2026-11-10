# PostgreSQL adapter foundation (Phase 33C)

This phase adds a carefully isolated PostgreSQL adapter and pool configuration. It remains disconnected from the Waltajjii runtime.

## Files
- `src/db/postgres-adapter.js`: parameterized query helpers and transaction wrapper.
- `src/db/postgres-pool-config.js`: validates a server-side `DATABASE_URL` and builds a node-postgres Pool configuration. The Pool constructor is injected; this file does not import a driver or open a connection.
- `test/postgres-adapter.test.js` and `test/postgres-pool-config.test.js`: Node built-in unit tests using mocks only.
- `.github/workflows/phase33c-adapter-tests.yml`: runs both test files on Node 22.

## Pool safeguards
- Requires a PostgreSQL URL and rejects other protocols.
- Defaults to a maximum of two connections; permitted range is 1–5 for the current small Render instance.
- Uses TLS with certificate verification enabled.
- Sets the PostgreSQL search path to `waltajjii,public` so app tables remain isolated in the dedicated schema.
- Does not log, print, or expose the connection URL.

## Run the tests
```sh
node --test test/postgres-adapter.test.js test/postgres-pool-config.test.js
```

## Important limitations
- No PostgreSQL driver dependency has been added yet; the Pool constructor is injected for isolated testing.
- No database connection is opened and no credentials are required for these tests.
- The adapter and pool configuration are not wired into the application runtime.
- The app continues to use synchronous `better-sqlite3` until all database call sites, authentication, and Socket.IO access are migrated and tested together.
- Do not set `DATABASE_URL`, run the saved SQL migration, or switch the Render service until the migration is fully reviewed and an explicit test plan is approved.


## Verification note
The pool configuration tests are part of the CI workflow and must pass before any connection or runtime integration is attempted.
