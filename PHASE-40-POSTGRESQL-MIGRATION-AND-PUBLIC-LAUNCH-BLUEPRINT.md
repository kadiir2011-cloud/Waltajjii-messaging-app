# Phase 40 — PostgreSQL migration and public-launch implementation blueprint

**Status:** Planning and static verification only.  
**Base:** Phase 39 timestamp/timezone contract branch.  
**Purpose:** Turn the prior audits into an ordered, testable implementation programme.

## Safety boundary

This phase does not connect to PostgreSQL or Supabase, execute SQL, migrate or delete data, alter secrets, change Render, merge code, or deploy. The current live test service remains untouched.

Do not expose public registration or invite real users until all release gates in this document are satisfied.

## Why the migration is mandatory

The current application uses synchronous SQLite through `better-sqlite3`. The Render Free service has no persistent disk. A local SQLite database on that service is not durable across service replacement/redeploy and is not a safe system of record for a public messaging service. Supabase Storage stores media objects; it is not the application's relational database.

The PostgreSQL DDL currently describes 29 application tables. The application must not be switched to PostgreSQL by merely adding a connection string: every database-coupled HTTP route, Socket.IO handler, and background worker must be converted and tested first.

## The 29-table migration inventory

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

## Required implementation sequence

### Gate A — Freeze and protect the current test release

- Record the exact known-good test branch/commit and current Render service configuration.
- Export the current SQLite database and media inventory from a controlled environment where the actual files are accessible.
- Verify backups by restoring them to a separate disposable environment.
- Never treat a ZIP of source code as a database backup; source, database, uploaded media, environment configuration, and recovery instructions are separate backup items.
- Record the current feature checklist and use it as the acceptance baseline.

### Gate B — Finish schema and adapter contracts

- Review all 29 DDL definitions, indexes, uniqueness rules, foreign keys, delete actions, and transaction boundaries against the live SQLite schema and route behavior.
- Keep Phase 38's composite poll-option ownership constraint.
- Apply Phase 39's explicit timestamp policy: legacy SQLite naive timestamp values are interpreted as UTC; offset-bearing ISO values preserve their instant; PostgreSQL stores instants as `TIMESTAMPTZ`.
- Keep PostgreSQL BIGINT identifiers as strings at application boundaries unless safe conversion is proven.
- Confirm Supabase connection pooling/direct connection requirements and TLS certificate validation without weakening certificate checks.
- Add integration tests against a disposable PostgreSQL instance before any production data migration.

### Gate C — Convert application database access in dependency order

1. **Auth and profile:** integrate the isolated Phase 34 router/service only after confirming JWT claim parity and response compatibility with the existing app.
2. **Presence and Socket.IO:** convert online-profile lookup, authentication, room membership, typing authorization, delivery/read receipts, and cross-instance presence. Replace in-memory-only presence with a design suitable for multiple application instances.
3. **Direct messaging:** convert message creation, history, reactions, hidden-message state, and receipts.
4. **Groups:** convert group membership/admin rules, invitations, join requests, activity, polls, events, RSVPs, and group messaging.
5. **Channels and social:** convert channel membership/messages, follows, connection requests, posts, likes, comments, notifications, and moments.
6. **Uploads and metadata:** retain Supabase Storage for media objects but persist ownership, references, and authorization metadata in PostgreSQL.
7. **Background work:** rewrite group-event reminders without SQLite `julianday()`, `INSERT OR IGNORE`, synchronous transactions, or `lastInsertRowid`. Use PostgreSQL transactions and a unique/atomic claim so two workers cannot send duplicate reminders.

Each slice must have route/service tests, authorization tests, error-path tests, and regression tests before moving to the next slice. Do not mount partially converted PostgreSQL routes in the live SQLite server.

### Gate D — Build a safe data migration

- Implement a repeatable, versioned migration tool that reads an exported SQLite snapshot and writes to a disposable PostgreSQL target first.
- Support dry-run mode, row counts, referential-integrity checks, duplicate detection, invalid timestamp reporting, and a detailed migration report.
- Preserve user IDs and relationships; do not silently renumber records.
- Hash/check uploaded media and verify every stored media reference resolves to the expected object.
- Make migration restartable and idempotent, with explicit checkpointing and rollback/recovery instructions.
- Compare source and target counts for every table, plus key relationships and representative records.
- Never run a migration against the live data until a verified backup and a tested restore are available.

### Gate E — Production infrastructure and security

- Select a production-capable host with persistent managed PostgreSQL, reliable application process uptime, HTTPS, environment-secret management, logs, health checks, and backup/restore support.
- Configure production database networking, TLS, least-privilege credentials, connection pooling, and migration credentials separately from runtime credentials.
- Confirm Supabase bucket privacy, signed/private media access where appropriate, file size/type validation, and storage policies.
- Review password hashing, JWT expiry/rotation, rate limiting, CORS, CSRF where applicable, input validation, authorization on every object, and protection against IDOR.
- Add monitoring for database connectivity, error rates, memory/CPU, storage failures, worker lag, and suspicious login/registration activity.
- Publish a privacy notice, terms of use, support contact, and a clear account/data deletion process before public registration.

### Gate F — Release acceptance and controlled launch

- Automated tests: all unit, route, adapter, integration, and migration tests pass.
- End-to-end tests with at least three separate accounts and independent browser sessions.
- Verify registration/login/logout, online presence, one-to-one messages, delivery/read receipts, replies/reactions, media uploads, voice/video calling, groups/admin controls, invitations, polls, events/reminders, channels, posts, comments, notifications, and language/translation features.
- Test simultaneous activity, reconnects, multiple tabs, expired tokens, unauthorized access, large/invalid uploads, and service restart.
- Test database backup restoration and media recovery, not merely backup creation.
- Perform a final privacy/security review and load test appropriate to the planned initial user population.
- Launch to a small invited pilot first; monitor and fix issues before opening registration more broadly.

## Release decision checklist

Public launch is blocked until every item is checked and evidence is recorded:

- [ ] PostgreSQL schema reconciled with actual SQLite schema and app behavior.
- [ ] All 29 tables migrated and verified in a disposable target.
- [ ] All HTTP routes converted and tested.
- [ ] All Socket.IO database operations and multi-instance presence converted and tested.
- [ ] Reminder worker converted and duplicate-safe.
- [ ] Migration dry-run, repeatability, rollback, and restore verified.
- [ ] Production hosting and persistent database provisioned securely.
- [ ] Supabase media policies and private access verified.
- [ ] Security, privacy, and data deletion review completed.
- [ ] Full multi-account end-to-end regression passed.
- [ ] Backup restoration and monitoring verified.
- [ ] Explicit approval obtained before production migration and deployment.

## Immediate next implementation task

**Phase 41 should begin with a schema-to-SQLite reconciliation report and a disposable PostgreSQL integration-test harness.** It should compare the actual SQLite table definitions, indexes, foreign keys, and representative SQL behaviors with the PostgreSQL DDL. Only after discrepancies are resolved should we start converting the runtime routes.

**Conclusion:** Phase 40 establishes the controlled path to public launch. It is not a claim that the app is already production-ready and it does not authorize a live migration or deployment.
