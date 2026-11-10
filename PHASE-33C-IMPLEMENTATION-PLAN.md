# Phase 33C — PostgreSQL adapter and authentication migration

**Branch:** `waltajjii-postgres-adapter-phase33c`  
**Status:** Isolated implementation branch; planning and compatibility gate only.  
**Production impact:** None. No Render configuration, Supabase SQL, or production branch is changed.

## 1. Scope decision

The requested first migration slice is PostgreSQL connectivity plus registration/login. Static inspection found that this slice cannot safely be switched independently in the current application.

The application imports the same synchronous `src/db.js` singleton in authentication, messages, groups, channels, social, moments, uploads, and server/socket handlers. Authentication's profile GET/PATCH endpoints also use this same SQLite singleton. Socket.IO token authentication and user/group lookups use it too.

If registration/login alone wrote to PostgreSQL while profile routes and Socket.IO continued reading SQLite, a newly registered user could authenticate but immediately fail profile loading and realtime initialization. This is an unacceptable half-migrated state.

Therefore Phase 33C must first establish a shared database boundary and runtime selection contract. The app must remain on SQLite until all code paths required by a logged-in session use the same selected database.

## 2. Confirmed current authentication behavior

File: `src/routes/auth.js`

- Registration validates usernames against `^[a-zA-Z0-9_]{3,30}$`.
- Password length is 12–128 characters.
- Password hashes use bcryptjs cost 12.
- Registration inserts into `users` using synchronous `db.prepare(...).run(...)` and returns `lastInsertRowid`.
- Duplicate usernames are detected using SQLite error code `SQLITE_CONSTRAINT_UNIQUE`.
- Login looks up `users.username = ?`, compares the bcrypt hash, and signs a JWT with issuer `waltajjii`, audience `waltajjii-users`, and a two-hour expiry.
- Profile GET and PATCH also use the synchronous SQLite singleton.

The PostgreSQL implementation must preserve these API response shapes, password hashing, JWT claims, validation limits, and case-insensitive username semantics. PostgreSQL inserts must use `RETURNING id`; duplicate handling must inspect PostgreSQL unique-violation code `23505` and the relevant constraint/index.

## 3. Required database boundary

Do not expose a fake synchronous PostgreSQL API. PostgreSQL I/O is asynchronous and must be awaited.

The planned boundary should provide:
- An explicit SQLite implementation preserving current behavior.
- A PostgreSQL implementation backed by a connection pool.
- A common asynchronous query/transaction contract.
- A server-only connection string; never expose it to browser code.
- A deliberate `waltajjii` schema search path, with no dependence on `public` for application tables.
- Parameterized SQL only.
- Transaction helpers that always release clients and roll back on failure.
- Consistent row/ID handling. BIGINT IDs must be checked or serialized safely before use in JavaScript and JSON.

The existing route code cannot be mechanically wrapped because it expects synchronous `.get()`, `.all()`, `.run()`, `db.transaction()`, `lastInsertRowid`, and SQLite-specific SQL.

## 4. Authentication migration sequence

1. Introduce the asynchronous database contract while leaving SQLite as the only active runtime.
2. Add a PostgreSQL implementation and configuration validation.
3. Add adapter-level tests against a disposable PostgreSQL database/schema.
4. Convert authentication registration, login, profile GET, and profile PATCH together.
5. Convert JWT/socket authentication and the user/group database lookups needed during socket connection.
6. Run API integration tests: register, duplicate registration (including case variants), login, invalid password, profile retrieval, profile update, and authenticated socket connection.
7. Only then enable PostgreSQL for an isolated test deployment.

Registration and login must not be enabled against PostgreSQL before steps 4–6 are complete.

## 5. Immediate blocker and scope boundary

The current `src/db.js` is not a thin connection module: it also creates and incrementally migrates all 29 SQLite tables. Numerous routes and `src/server.js` directly call SQLite methods. Converting authentication safely therefore requires first extracting schema initialization from the database connection and migrating all authenticated-session dependencies together.

The current Phase 33B DDL is not to be executed as part of this stage. It remains a draft pending field-level reconciliation and PostgreSQL integration tests.

## 6. Safety and acceptance criteria

- Keep `waltajjii-production-readiness-phase33` and production unchanged.
- Do not add `DATABASE_URL` to Render yet.
- Do not run the saved SQL in Supabase yet.
- Do not change the `waltajjii-media` Storage bucket.
- Do not remove SQLite or the current database file.
- Do not switch the Render test service until the adapter and complete login-session path pass automated tests.

**Phase 33C is accepted only when a test deployment can register, log in, load/update the profile, and establish its authenticated socket session using PostgreSQL, while SQLite fallback remains available.**
