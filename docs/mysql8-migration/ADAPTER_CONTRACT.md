# MySQL 8 adapter contract — Stage 2

**Status:** isolated adapter foundation; no production route is connected to it.

## Scope and safety

- This adapter is only for the MySQL 8 migration branch and the disposable local MySQL 8.0.36 instance.
- `src/server.js` and all SQLite route modules remain unchanged.
- Do not configure these `MYSQL_*` variables in the live Render service.
- Do not deploy this branch to the live Render service.

## Dependency and lockfile

`package.json` now declares `mysql2` and the isolated adapter test command. The package lock must be regenerated on the migration branch before a clean `npm ci` can be considered valid:

```powershell
npm install --package-lock-only
npm install
npm run test:mysql8:adapter
```

Review and commit the resulting `package-lock.json` on this branch. Do not run these commands from the production branch.

## Configuration

Use only local validation credentials or a dedicated non-production MySQL instance:

- `MYSQL_HOST`
- `MYSQL_PORT` (default 3306)
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_POOL_SIZE` (default 5; accepted range 1–50)
- `MYSQL_SSL` (`true` or `false`; TLS verifies the server certificate)

Never put credentials in source control or chat.

## API

The module exports a dependency-injected factory. A future migration-only bootstrap can create it as follows:

```js
const mysql = require("mysql2/promise");
const { createMySqlAdapter } = require("./db-mysql");

const mysqlDb = createMySqlAdapter({
  mysql,
  env: process.env
});

// Read/query:
const [rows] = await mysqlDb.query("SELECT id FROM users WHERE id = ?", [userId]);

// Prepared execution:
const [result] = await mysqlDb.execute(
  "UPDATE users SET bio = ? WHERE id = ?",
  [bio, userId]
);

// All statements in a transaction use the same pinned connection:
await mysqlDb.withTransaction(async (connection) => {
  await connection.execute("INSERT INTO example(value) VALUES (?)", [value]);
  await connection.execute("UPDATE counters SET total = total + 1 WHERE id = ?", [counterId]);
});

// During orderly shutdown, after requests and workers have drained:
await mysqlDb.close();
```

## Adapter guarantees

- Acquires a pooled connection for each standalone query/execute operation.
- Sets MySQL session `time_zone = '+00:00'` once per physical pooled connection before application SQL.
- Pins all statements inside `withTransaction` to one connection; commits on success and rolls back on failure.
- Uses UTF-8 (`utf8mb4`), parameter placeholders, and disables multi-statements.
- Returns BIGINT values as strings to avoid JavaScript Number precision loss. Route/API integration must preserve this policy or explicitly convert only values proven safe.
- Returns DATE/DATETIME values as strings; the application layer must own parsing and UTC serialization.
- Does not expose the raw pool, so callers cannot accidentally bypass the UTC initialization wrapper for standalone queries.

## Test coverage in this milestone

`test/mysql8-adapter.test.js` uses a fake mysql2-compatible pool to test configuration validation, connection options, per-connection UTC initialization, transaction connection pinning, commit/rollback, ping, and pool shutdown. These are adapter contract tests, not proof of route compatibility or a live-server integration test.

## Not included yet

- No route, Socket.IO handler, worker, or production bootstrap uses this adapter.
- No SQLite-to-MySQL SQL conversion is complete.
- No data import or production cutover is authorized.
- A real MySQL 8.0.36 integration test remains a separate validation step after the lockfile is regenerated.
