# Phase 33B — PostgreSQL schema reconciliation report

**Status:** Static source review completed; migration remains unexecuted and is not approved for live use.

**Branch:** `waltajjii-production-readiness-phase33`

## 1. What was compared

The PostgreSQL draft at `migrations/postgres/001_initial_schema.sql` was compared with the complete SQLite schema initialization and incremental migrations in `src/db.js`, and with SQL-sensitive usage in the route modules and `src/server.js`.

## 2. Structural table inventory

The PostgreSQL draft contains the same 29 application table names present in the SQLite schema:

1. users
2. messages
3. groups
4. group_members
5. group_messages
6. follows
7. connection_requests
8. posts
9. post_likes
10. post_comments
11. notifications
12. channels
13. channel_members
14. channel_messages
15. moments
16. message_reactions
17. message_hidden_for
18. group_message_reactions
19. group_message_receipts
20. group_invitations
21. group_invitation_events
22. group_join_requests
23. group_activity
24. group_polls
25. group_poll_options
26. group_poll_votes
27. group_events
28. group_event_rsvps
29. group_event_reminder_deliveries

The draft includes the profile fields and later-phase columns added through SQLite ALTER TABLE migrations, including message receipts/replies/edits/deletions/forwarding, group message media/replies/edits/deletions/pinning/announcements, group privacy/settings, and event reminders.

**Finding:** The draft is a reasonable structural representation of the current 29-table inventory. This is not proof of runtime compatibility or live PostgreSQL execution. The application source remains the authority if any field-level discrepancy is found during the implementation and tests.

## 3. Important application incompatibilities confirmed

The current app is still built around synchronous `better-sqlite3`. The SQL migration alone cannot be connected to the current application safely.

### A. Database driver and asynchronous execution
- `src/db.js` opens a local SQLite file using `new Database(dbPath)`.
- Route modules call synchronous `.get()`, `.all()`, and `.run()`.
- Group, channel, social, and server logic uses synchronous `db.transaction()`.
- A PostgreSQL client/pool is asynchronous. Routes and transaction boundaries must be refactored to `async/await` and PostgreSQL transactions.

### B. Parameter placeholders
- Current statements use SQLite `?` placeholders.
- PostgreSQL drivers use numbered placeholders such as `$1`, `$2`.
- All statements must be converted deliberately; do not apply a blind text replacement because some queries build dynamic placeholder lists.

### C. Inserted IDs
- Code reads `result.lastInsertRowid` in registration, messaging, groups, channels, social features, polls, invitations, comments, and events.
- PostgreSQL inserts must use `RETURNING id` and the returned row's ID. Keep API IDs safely serialized for JavaScript (PostgreSQL BIGINT values can exceed JavaScript's safe integer range).

### D. SQLite-specific SQL found in active routes
- `INSERT OR IGNORE` occurs in messages, groups, channels, social features, and reminder delivery logic. Replace with explicit `ON CONFLICT (...) DO NOTHING` using the actual unique key.
- `datetime(...)` occurs in group membership/history and invitation expiry checks, and in moments expiry logic.
- `julianday(...)` is used by the event reminder worker.
- `COLLATE NOCASE` is used for username ordering/search in social and server queries. PostgreSQL needs explicit case-insensitive expressions or an appropriate collation.
- `PRAGMA` is used in schema initialization and cannot be carried over as PostgreSQL SQL.

### E. Username behavior
- SQLite defines `users.username` as `COLLATE NOCASE UNIQUE`.
- The draft correctly approximates case-insensitive uniqueness with a unique index on `LOWER(username)`.
- Authentication and all username lookup queries must also compare case-insensitively (for example, `LOWER(username) = LOWER($1)`) so lookup behavior matches uniqueness.

### F. Timestamp behavior
- The SQLite schema stores timestamp columns as TEXT and relies on SQLite date functions in several routes.
- The draft uses PostgreSQL `TIMESTAMPTZ`.
- Every date comparison, event reminder calculation, expiry check, JSON serialization expectation, and ordering path must be reviewed and tested with PostgreSQL timestamps. Do not assume that changing the column type alone preserves behavior.

## 4. Further integrity review required

- Poll votes currently reference `poll_id` and `option_id` independently. The schema does not enforce that the selected option belongs to the same poll. Consider a composite foreign key after confirming application behavior and adding the corresponding unique key on poll options.
- Review uniqueness and conflict targets for all former `INSERT OR IGNORE` operations before converting them.
- Review deletion behavior and foreign-key actions against all existing application workflows.
- Confirm whether the app will connect using a server-only PostgreSQL role and a deliberate `waltajjii` search path. Do not expose database credentials to browser code or grant anonymous access to these tables.

## 5. Safe next implementation sequence

1. Keep the saved SQL unexecuted for now.
2. Add PostgreSQL-specific database configuration and a small repository layer on the isolated test branch, without replacing the live SQLite path.
3. Convert and test authentication first, including case-insensitive usernames and `RETURNING id`.
4. Convert messages and receipts; then social features, channels, moments, and groups/events in separate small steps.
5. Add automated integration tests against an isolated PostgreSQL test schema/database.
6. Only after the app passes those tests, run the reviewed DDL in the selected Supabase project and configure the server-only connection.
7. Keep Render production and the current SQLite deployment untouched until explicit approval and a tested rollback/backup plan.

## 6. Current safety state

- No SQL has been run in Supabase.
- No Supabase schema, table, policy, or Storage object has been changed by this review.
- No Render environment variable or deployment has been changed.
- No production application code has been changed.
- The existing `waltajjii-media` Storage bucket is separate from the relational database migration and remains untouched.

**Conclusion:** The current DDL is structurally aligned with the 29-table SQLite inventory, but Waltajjii is not yet PostgreSQL-compatible. The next work is the application database-layer conversion and test coverage, not executing the draft migration.
