# PostgreSQL adapter foundation (Phase 33C)

This folder contains the first isolated building block for the PostgreSQL migration.

## Files
- `src/db/postgres-adapter.js`: dependency-free adapter around a node-postgres-compatible Pool. It provides parameterized query helpers and a transaction wrapper.
- `test/postgres-adapter.test.js`: Node.js built-in tests using a mock pool; no database credentials or live PostgreSQL instance are needed.

## Run the tests
```sh
node --test test/postgres-adapter.test.js
```

## Important limitations
- The adapter is **not connected to the application runtime**.
- It does not create a Pool or read `DATABASE_URL`.
- It does not change `src/db.js`, authentication routes, Socket.IO, or Render configuration.
- The application continues to use SQLite until all synchronous database call sites have been migrated and integration-tested together.
- A later commit must add and pin the PostgreSQL driver, construct a server-only Pool with the intended `waltajjii` schema search path, and test it against an isolated PostgreSQL database.

This staged approach avoids a partial migration where registration writes to PostgreSQL while profile/session/realtime code still reads SQLite.
