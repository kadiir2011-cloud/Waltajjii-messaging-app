# MySQL 8 data-access adapter (isolated)

`src/db-mysql.js` is a preliminary asynchronous connection/pool module for the migration branch only. It is deliberately not imported by `src/server.js` or any live route.

## Dependency

When implementing this branch in a development environment, add the official `mysql2` package and commit the resulting package manifest and lockfile together:

```powershell
npm install mysql2
```

Do not deploy this branch until the lockfile has been regenerated and clean-install tests pass.

## Private environment variables

Set these only in the isolated development/test environment or the future private Render service:

- `MYSQL_HOST` — private hostname assigned by Render (do not guess it)
- `MYSQL_PORT` — normally 3306
- `MYSQL_DATABASE` — `waltajjii`
- `MYSQL_USER` — dedicated least-privilege application user
- `MYSQL_PASSWORD` — strong generated secret; never commit or send in chat
- `MYSQL_POOL_SIZE` — conservative pool size; initial default is 5
- `MYSQL_SSL` — enable only when the server endpoint is configured for verified TLS

Never expose MySQL on a public interface. Restrict the application account to the Waltajjii schema and required DML privileges; use a separate migration account for DDL.

## API

- `pool.execute(sql, values)` / `pool.query(sql, values)` for asynchronous parameterized statements.
- `withTransaction(async (connection) => { ... })` pins work to one connection and commits or rolls back.
- `ping()` verifies connectivity and returns the server version.
- `close()` drains the pool during graceful shutdown.

All route code must await operations. Do not emulate synchronous `better-sqlite3` methods or expose a fake `prepare().get()` API. The adapter is not yet wired into the application.

## Important correctness notes

- Keep `multipleStatements` disabled.
- Use parameter placeholders and never interpolate untrusted values. For dynamic `IN` lists, construct only the placeholder count from a validated array length and pass values separately.
- Use explicit transaction boundaries for multi-step writes.
- Avoid returning unsafe BIGINT values as JavaScript numbers. The final DDL must choose an ID width compatible with current data and Node.js safe-integer constraints; if BIGINT is selected, return strings or use a deliberate BigInt serialization policy.
- MySQL unique-index NULL semantics differ from SQLite partial unique indexes. Pending group-join-request uniqueness requires a MySQL-safe design and concurrency tests.
- MySQL `INSERT IGNORE` can suppress more errors than SQLite `INSERT OR IGNORE`; prefer targeted `INSERT ... ON DUPLICATE KEY UPDATE` or explicit conflict handling.
- Do not run schema DDL or data imports automatically at application startup.
