# Phase 33 — Database Migration Inventory

## Status

Inventory only. No runtime code, database schema, Render setting, Supabase project, or deployment was changed by this document.

## Executive finding

Waltajjii's application database is SQLite through `better-sqlite3`. `src/db.js` creates `STORAGE_DIR/waltajjii.db`, or defaults to the repository's `data/waltajjii.db`. The application currently depends on a synchronous SQLite API throughout its route handlers and server code.

The Supabase JavaScript client is already used by `src/storage.js` for media object storage. This is separate from the application database. The presence of `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` does not mean application records are stored in Supabase Postgres.

## Current persistence map

| Data | Current location / mechanism |
|---|---|
| Accounts, credentials, profiles | SQLite `users` table |
| Direct and group messages, receipts, reactions | SQLite |
| Groups, membership, invitations, join requests | SQLite |
| Channels and channel messages | SQLite |
| Posts, comments, likes, follows, connections | SQLite |
| Notifications, moments, polls, events and RSVPs | SQLite |
| Media objects | Supabase Storage via `src/storage.js` when configured |
| Online presence and active calls | In-memory maps in `src/server.js`; not durable |

On a Render Free service with no persistent disk, local SQLite files and local fallback uploads must be treated as ephemeral. Supabase Storage media objects are separate from that local database.

## Tables identified in `src/db.js`

There are 29 application tables:

1. `users`
2. `messages`
3. `groups`
4. `group_members`
5. `group_messages`
6. `follows`
7. `connection_requests`
8. `posts`
9. `post_likes`
10. `post_comments`
11. `notifications`
12. `channels`
13. `channel_members`
14. `channel_messages`
15. `moments`
16. `message_reactions`
17. `message_hidden_for`
18. `group_message_reactions`
19. `group_message_receipts`
20. `group_invitations`
21. `group_invitation_events`
22. `group_join_requests`
23. `group_activity`
24. `group_polls`
25. `group_poll_options`
26. `group_poll_votes`
27. `group_events`
28. `group_event_rsvps`
29. `group_event_reminder_deliveries`

## Code areas coupled to SQLite

- `src/db.js`: schema creation, additive migrations, SQLite pragmas, foreign keys, indexes.
- `src/routes/auth.js`: account creation, login/profile reads and updates.
- `src/routes/messages.js`: direct messages, read/delivery receipts, reactions, hiding, forwarding and edits.
- `src/routes/groups.js`: group membership/roles, messages, receipts, invitations, join requests, polls and events.
- `src/routes/channels.js`: channel creation, membership and messages.
- `src/routes/social.js`: follows, connection requests, posts, likes, comments and notifications.
- `src/routes/moments.js`: expiring moments and media metadata.
- `src/routes/uploads.js`: media authorization and avatar metadata.
- `src/server.js`: online user lookup, presence, event reminder worker and translation endpoint.
- `src/storage.js`: Supabase Storage object upload/download/removal; not the SQL database.

## SQLite-specific constructs requiring deliberate conversion

The code uses the synchronous `better-sqlite3` interface (`db.prepare(...).get/all/run`, `db.transaction(...)`), `lastInsertRowid`, `INSERT OR IGNORE`, SQLite date/time functions such as `datetime()` and `CURRENT_TIMESTAMP`, `PRAGMA` introspection, SQLite `AUTOINCREMENT`, and `INTEGER PRIMARY KEY` semantics.

A PostgreSQL migration therefore cannot safely be achieved by simply adding a `DATABASE_URL` variable or swapping a connection library. Route handlers, transaction boundaries, parameter binding, generated IDs, schema migrations, date comparisons and error handling must be adapted and tested.

## Recommended migration approach

1. Keep the existing SQLite test branch and Render deployment unchanged as a rollback reference.
2. Create a separate Supabase Postgres schema and a versioned migration for all 29 tables, constraints, indexes and foreign keys.
3. Introduce a PostgreSQL repository/data-access layer and migrate route modules in small, reviewable groups. Convert synchronous handlers and transactions carefully; do not mix SQLite and Postgres writes in production.
4. Keep Supabase Storage for media, with private bucket access and server-side authorization. Confirm that no user uploads silently fall back to local ephemeral storage when public deployment is intended.
5. Add automated tests for registration/login, messages and receipts, group membership/roles, invitations, channels, social feed, moments, polls, events/reminders and notifications.
6. Validate with disposable test accounts and a clean test schema. Verify foreign-key behavior, uniqueness, concurrent updates, timezone handling and deletion cascades.
7. Add a backup/restore runbook and prove restoration before public launch.
8. Only after all tests pass, decide whether to cut over the test service. Do not merge to production or delete the SQLite database without explicit approval and a verified backup.

## Important design decision

Because the current code is deeply coupled to synchronous `better-sqlite3`, a full PostgreSQL conversion is a substantial refactor. It is safer to do it incrementally behind a dedicated development branch than to attempt a quick database-driver replacement.

An alternative for the short term is a paid Render persistent disk with SQLite, which is a smaller change. It is not the chosen long-term architecture if the goal is managed PostgreSQL, but it may be useful if a rapid, lower-risk launch is prioritized.

## Not yet verified

- Actual contents and size of the live SQLite database.
- Whether any local media fallback files exist.
- Whether all media upload paths use Supabase Storage in every code path.
- Supabase project's database availability, region, plan, backup retention and connection settings.
- Automated test coverage and successful end-to-end execution.

No production readiness certification is implied by this inventory.
