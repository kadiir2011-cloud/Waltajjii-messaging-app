# Phase 50 — Application-wide PostgreSQL integration readiness audit

**Audit base:** Phase 49 / Phase 48 stacked draft branch  
**Scope:** Production entry point, HTTP routers, Socket.IO handlers, scheduled reminder worker, persistence adapter, storage and isolated PostgreSQL modules.  
**Result:** PostgreSQL foundation and several isolated domains are tested, but the application is **not ready for a production database switch**.

## 1. Executive result

The production entry point \`src/server.js\` still imports \`src/db.js\`, the synchronous \`better-sqlite3\` database. The production HTTP routes mounted there are the SQLite implementations. PostgreSQL auth, presence, direct-message, group and channel routers/services are isolated test modules and are not mounted by the production server.

This is the correct safe state for now: the live test app remains on its existing SQLite runtime. Do not set a production database switch or deploy the PostgreSQL adapter until the remaining domains and the complete Socket.IO/background-worker path are converted and tested together.

## 2. Production SQLite coupling inventory

The following production files still contain SQLite persistence or SQLite-specific SQL:

| Production area | File(s) | Remaining work |
|---|---|---|
| Runtime/database bootstrap | \`src/server.js\`, \`src/db.js\` | Replace synchronous DB initialization only after all consumers are converted; move schema initialization to ordered migrations |
| Authentication/profile | \`src/routes/auth.js\` | Replace registration, login, profile read/update with the tested PostgreSQL auth service/router; reconcile username case-sensitivity intentionally |
| Direct messaging | \`src/routes/messages.js\` | Replace all send/history/read receipts/reply/edit/forward/reaction/delete/hide SQL with PostgreSQL router/service; confirm full UI response parity |
| Groups | \`src/routes/groups.js\` | Replace full group lifecycle, roles, membership, settings, activity, messages, announcements, reactions, receipts, pins, invitations, join requests, polls, events, RSVPs and reminders |
| Channels | \`src/routes/channels.js\` | Replace create/discover/join/leave/member management and message history/publishing with PostgreSQL channel router/service and migration 002 |
| Social/discovery/feed | \`src/routes/social.js\` | PostgreSQL implementation still required for user discovery, follows, connection requests, notifications, posts, likes, comments and feed |
| Moments/stories | \`src/routes/moments.js\` | PostgreSQL implementation required for create/list/visibility/follower checks/expiry/delete |
| Upload authorization/metadata | \`src/routes/uploads.js\` | Replace SQLite lookups/updates for message, group-message and avatar ownership/metadata; retain secure Supabase Storage handling |
| Presence, sockets and delivery | \`src/server.js\` | Convert online-profile lookup, group-room membership, group typing authorization, direct-message delivery receipts and socket lifecycle integration |
| Group-event reminder worker | \`src/server.js\` | Convert due-event query, atomic deduplication claim and notification insert to PostgreSQL; use a concurrency-safe transaction/claim pattern |

\`src/routes/calls.js\` has no direct SQLite query in the audit. Its HTTP call/token behavior still needs to be included in the final integrated regression suite. \`src/storage.js\` has no direct SQLite query, but its local-filesystem behavior and durable object-storage contract must be checked for production.

## 3. PostgreSQL components already present (isolated)

- Auth/profile: \`src/services/postgres-auth-service.js\` and \`src/routes/postgres-auth.js\`.
- Presence/delivery service and router: \`src/services/postgres-realtime-service.js\`, \`src/routes/postgres-presence.js\`.
- Direct messaging: \`src/services/postgres-messages-service.js\`, \`src/routes/postgres-messages.js\`.
- Group messaging: \`src/services/postgres-groups-service.js\`, \`src/routes/postgres-groups.js\`.
- Channel messaging and interactions: \`src/services/postgres-channels-service.js\`, \`src/routes/postgres-channels.js\`, migrations 001 and 002.
- Isolated Socket.IO module: \`src/postgres/postgres-realtime-socket.js\`.
- Injected PostgreSQL test app: \`src/postgres/test-app.js\`.

These are not evidence that the live server uses PostgreSQL. The production \`src/server.js\` currently mounts the SQLite routers and contains SQLite socket/worker queries.

## 4. Important gaps before a safe switch

### A. Route and UI contract parity
For each domain, compare every existing SQLite endpoint with its PostgreSQL replacement: path, HTTP method, authentication, status codes, request validation, response keys, privacy rules, ordering, pagination, socket events and error behavior. Tests must exercise actual routes, not only service methods.

### B. Full realtime integration
The isolated Socket.IO work must be integrated with the PostgreSQL services and tested through real Socket.IO clients connected to the disposable PostgreSQL test app. Cover:
- authenticated connection and reconnect;
- multi-tab/device presence and room membership;
- direct and group typing authorization;
- direct-message delivery/read receipts;
- group/channel message and interaction broadcasts;
- call signaling and disconnect cleanup;
- membership changes and room joins/leaves;
- database failures and socket acknowledgement behavior.

The current production server still has SQLite-backed socket handlers. Do not replace them with a partial socket module.

### C. Remaining product domains
Social/feed, moments, uploads, call-related persistence if any, group invitations/join requests/polls/events/RSVPs and notifications need complete PostgreSQL parity and isolated integration tests.

### D. Background jobs and atomicity
The group-event reminder worker must be PostgreSQL-native, idempotent under concurrent workers, timezone-correct, observable, and covered by tests for duplicate execution and retry after failure.

### E. Media durability and access control
Supabase Storage is separate from database migration. Verify private bucket access, signed/download authorization, object ownership, file-size/MIME validation, cleanup after message deletion, avatar replacement/deletion, and recovery behavior. Do not depend on Render's ephemeral filesystem for user media or durable state.

### F. Data migration and recovery
Design a repeatable SQLite-to-PostgreSQL migration for all tables, preserving IDs, relationships, timestamps, hidden/deleted states, receipts and user media references. Include row-count/checksum reconciliation, sequence advancement, dry-run, backup/restore rehearsal, cutover plan and tested rollback/recovery. Never run it against the real Supabase project without explicit approval.

### G. Operational readiness
Before public release: durable PostgreSQL and object storage, verified backups and restore test, secrets management, TLS verification, least-privilege database role, rate limits, monitoring/alerts, health/readiness checks, error logging without secrets, resource sizing and load/concurrency testing.

## 5. Recommended phase order

1. **Phase 51 — Social and feed PostgreSQL parity:** follows, connection requests, notifications, discovery, posts, likes and comments.
2. **Phase 52 — Moments PostgreSQL parity:** visibility, followers, expiry and deletion.
3. **Phase 53 — Groups full-domain parity:** invitations, join requests, activity, polls, events, RSVPs and reminder persistence.
4. **Phase 54 — Upload/media integration:** PostgreSQL metadata and secure durable Supabase Storage access.
5. **Phase 55 — Full realtime integration:** production-equivalent Socket.IO module and real-client PostgreSQL tests.
6. **Phase 56 — Application-wide route contract and regression suite:** all current frontend API and socket contracts.
7. **Phase 57 — SQLite-to-PostgreSQL data migration rehearsal:** disposable restored data, validation, backup and recovery rehearsal.
8. **Phase 58 — Cutover readiness review:** security, operations, performance, monitoring and rollback sign-off.
9. Only after explicit approval: schedule a controlled migration/cutover. Keep the current live test service unchanged until then.

## 6. Safety boundary

This phase is an audit/documentation change only. It does not modify application runtime code, mount PostgreSQL routers, execute SQL against live Supabase, change Render environment variables, merge stacked draft PRs, or deploy. Phase 49 and the Phase 47/48 PostgreSQL disposable integration workflows have passed; that does not mean the full application has passed end-to-end PostgreSQL validation.

**Decision:** Continue with Phase 51 (social and feed PostgreSQL parity). Do not make Waltajjii public yet.
