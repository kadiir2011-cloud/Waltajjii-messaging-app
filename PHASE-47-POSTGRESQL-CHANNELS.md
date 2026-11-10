# Phase 47 — PostgreSQL channels and channel messaging

## Scope
Ports the existing SQLite channel behavior to an isolated PostgreSQL service/router pair: public/private discovery, channel ownership, membership, owner/admin publishing, member management, chronological message history, and leaving a channel.

## Implementation
- `src/services/postgres-channels-service.js`: asynchronous parameterized SQL and transactions.
- `src/routes/postgres-channels.js`: isolated JWT-protected HTTP router using Waltajjii issuer/audience.
- `test/phase47-postgres-channels-integration.test.js`: HTTP integration tests against disposable PostgreSQL 16.
- `.github/workflows/phase47-postgres-channels.yml`: ephemeral-database CI workflow.

## Security and compatibility
- Private channels are hidden from discovery and cannot be joined via the public join endpoint.
- Only owners/admins can invite/remove members or publish announcements.
- Channel owners cannot leave or be removed; ownership transfer is a future feature.
- Only members can view channel members and messages.
- BIGINT IDs remain strings; no unsafe JavaScript Number conversion.
- Socket events occur after successful database writes; Socket.IO remains optional in isolated tests.

## Explicit exclusions
The current foundation schema has no channel-message reactions, receipts, editing, pinning, or media metadata. This phase does not invent those structures; they need a separately reviewed schema extension.

## Safety
The router is not mounted in the running app. CI uses disposable PostgreSQL only. No live Supabase DDL, Render environment, production runtime, or deployment is changed.
