# Phase 43 — PostgreSQL authentication and profile integration

## Scope

Phase 43 exercises the existing injected PostgreSQL authentication service and router against a disposable PostgreSQL 16 database. It verifies the actual HTTP-to-service-to-adapter-to-database path for registration, login, JWT verification, profile retrieval, and profile updates.

The existing SQLite application remains the active runtime. This phase does not mount the PostgreSQL router in `src/server.js`, change the production database configuration, or alter Render/Supabase settings.

## Behavior contract checked

- Registration retains the 3–30 character username rule and 12–128 character password rule.
- Password hashes are generated with bcrypt cost 12; plaintext passwords are never stored.
- Duplicate usernames are rejected by the PostgreSQL case-insensitive unique index and mapped to HTTP 409.
- Login uses case-insensitive username lookup and bcrypt verification.
- JWT retains the `userId` and `username` claims, two-hour expiry, issuer `waltajjii`, and audience `waltajjii-users`.
- Profile routes require a Bearer token verified against the same issuer and audience.
- Profile retrieval preserves the existing camelCase API fields.
- Profile update preserves the existing field limits, allowed background/mode values, website validation, and response shape.
- PostgreSQL BIGINT identity values are carried without unsafe JavaScript number conversion.

## Important compatibility observation

The legacy SQLite login query compares usernames exactly, whereas the PostgreSQL service deliberately uses case-insensitive lookup to match the case-insensitive unique index. This phase verifies that behavior as implemented in the PostgreSQL service. Before switching the production runtime, the team must explicitly approve whether case-insensitive login is the intended application-wide contract and align SQLite/PostgreSQL behavior accordingly.

## Test isolation and safety

GitHub Actions starts its own ephemeral PostgreSQL 16 service and uses only the CI-provided `TEST_DATABASE_URL`. The test applies the draft schema only to that disposable database, creates one synthetic account, exercises the HTTP endpoints, and deletes the synthetic account afterward.

No Supabase database is contacted. No live user data is read or changed. No production secrets are used. No Render deployment, runtime switch, merge, or migration of existing SQLite data is performed.

## Exit criteria

The workflow must pass before this phase can be considered verified. Even after it passes, authentication/profile are not yet mounted in the running application. Remaining work includes presence/Socket.IO integration, conversion of all SQL-coupled routes and the reminder worker, full end-to-end regression, data migration/rollback rehearsal, and production infrastructure/security acceptance.
