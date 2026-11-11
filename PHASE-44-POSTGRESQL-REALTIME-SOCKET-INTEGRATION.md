# Phase 44 — PostgreSQL realtime and Socket.IO integration

## Scope

This phase introduces an isolated Socket.IO integration module that delegates all persistence and membership checks to the asynchronous PostgreSQL realtime service. It covers JWT authentication, per-user rooms, online presence snapshots and transitions, multi-session presence, group room initialization, direct/group typing, recipient-authorized message delivery receipts, and paired WebRTC call signaling.

## Design and safeguards

- The module receives an existing Socket.IO server, JWT verifier/secret, and PostgreSQL realtime service by dependency injection.
- It creates no database pool and imports no SQLite module.
- PostgreSQL BIGINT IDs remain decimal strings; no unsafe Number conversion is used.
- Group typing is authorized by a fresh PostgreSQL membership check.
- Delivery receipts are written only for the authenticated recipient; the sender is notified only after persistence succeeds.
- Call signaling is forwarded only for connected users in a paired call.
- A user remains online until their final socket session disconnects.
- Database errors are returned as generic acknowledgements and do not expose connection details.

## Test strategy

The Phase 44 workflow runs isolated Node.js tests using deterministic fake Socket.IO server/socket objects and the existing PostgreSQL service contract. It verifies middleware authentication, rooms, presence lifecycle, group membership, delivery receipt authorization, call pairing, and safe failure responses.

## Runtime status

The existing SQLite server remains unchanged and continues to serve the test deployment. The new module is not mounted in `src/server.js`; no runtime database switch or production deployment is made in this phase.

## Remaining gates

Before any PostgreSQL runtime activation, the project still needs an end-to-end integration test using a real Socket.IO server and disposable PostgreSQL database, followed by conversion of direct-message/group/channel/social/moments/upload routes and the reminder worker, complete regression tests, data migration and rollback rehearsal, and production hosting/security review.
