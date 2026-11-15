# Phase 100 — PostgreSQL / SQLite compatibility audit

## Scope

This phase compares the live SQLite HTTP and Socket.IO contracts with the opt-in PostgreSQL HTTP and realtime implementation. It adds a repeatable source-level regression test and records the known migration deltas. It does not switch the active runtime.

## HTTP route audit

The method/path contracts currently match between SQLite and PostgreSQL for:
- Authentication and profile: register, login, get profile, update profile.
- Direct messages: user list, send, conversation, read receipts, delete, edit, forward, reactions.
- Groups: group lifecycle, members, messages, delivery/reactions/edit/delete/pin, governance, invitations, join requests, polls, events, RSVP.
- Channels: all current SQLite routes are present. PostgreSQL also includes channel message delivery/read receipts, reactions, edit/delete, and pin operations.
- Social: discovery, follow/unfollow, connection requests, followers/following, feed/posts, likes, comments, notifications.
- Moments: list, create, media retrieval, delete.
- Calls: TURN credential retrieval.

PostgreSQL additionally mounts presence, translation, AI assistant, and audio transcription endpoints in its opt-in API composition.

### Explicit HTTP delta: media URL parameter

SQLite's generic upload retrieval route is `GET /:filename`; PostgreSQL exposes `GET /:mediaId`. This is an intentional opaque-storage-ID model rather than a filename-based storage path. Before cutover, client references and all media URL producers must be confirmed to use the PostgreSQL media ID contract; the route name alone does not establish client compatibility.

## Realtime audit — release blockers

The live SQLite Socket.IO server registers these events that the PostgreSQL realtime implementation does not yet register:

- Direct-call recovery: `call:recovery-request`, `call:recovery-offer`, `call:recovery-answer`.
- Group calls: `group-call:start`, `group-call:status`, `group-call:join`, `group-call:hand-raise`, `group-call:moderate`, `group-call:leave`, `group-call:end`.

The PostgreSQL implementation has `call:caption`, which is not registered by the current SQLite server source audited here. This difference needs a deliberate product-contract decision.

**Cutover blocker:** PostgreSQL realtime is not feature-equivalent until the ten missing live events are implemented and tested for authorization, membership, multi-session behavior, reconnect/recovery, and cleanup—or the product owner explicitly retires those contracts and the client is updated.

## Safety and scope

- The live `src/server.js` still uses the SQLite database and Socket.IO implementation.
- This phase adds audit tests and documentation only. It does not modify runtime routes, database schemas, Render, Supabase, production credentials, or live data.
- Source-level route parity is not full behavioral parity. Request/response payloads, validation, status codes, permissions, media access rules, transaction behavior, concurrency, and event payloads still require integration tests against isolated staging services.
- No production cutover is approved by this audit.

## Verification

```sh
node --test test/phase100-postgres-sqlite-compatibility-audit.test.js test/phase99-postgres-staging-bootstrap.test.js test/phase98-postgres-service-composition.test.js test/phase97-postgres-runtime-migration-map.test.js test/phase96-staging-integration-safety.test.js
```

The test suite asserts the observed HTTP route contracts, the explicitly known media route delta, the exact realtime event gap list, and that the active production entrypoint remains SQLite.
