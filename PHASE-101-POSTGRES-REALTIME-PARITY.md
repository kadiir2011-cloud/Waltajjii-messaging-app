# Phase 101 — PostgreSQL realtime parity

## Implemented

- Direct-call recovery request, offer, and answer relay events.
- Group-call start, status, join, peer offer/answer/ICE signaling, hand raise, moderation, leave, and host end events.
- Shared in-memory group-call state across connected Socket.IO sessions.
- Current PostgreSQL group-membership checks for group-call start/join/status and signaling participants.
- Host/admin-only moderation using a new PostgreSQL group-member role lookup.
- Existing one-to-one/group-call exclusion, one-group-call-per-user rule, eight-participant cap, and host-protected removal.
- Disconnect, leave, removal, and host-end cleanup with participant notifications and room cleanup.

## Security and behavior

- Socket authentication continues to require a signed Waltajjii JWT with the expected issuer and audience.
- Direct-call recovery is accepted only for the two users in the currently tracked active call.
- Group-call signaling is relayed only between active participants who are still current members of the group.
- Moderation actions are allow-listed: remove, lower-hand, and request-mute. A mute request is advisory; the server does not remotely override a user's media track.
- Group-call media remains peer-to-peer; the server only coordinates signaling.
- Group-call state is ephemeral and is lost on server restart. This matches the current in-memory call coordination model; it is not a durable call history.

## Verification

- Phase 101 tests verify event registration, shared state placement, membership checks, moderation authorization, cleanup paths, and role lookup behavior.
- Phase 100 compatibility audit is updated to assert the ten previously missing live event names are now registered in PostgreSQL.
- CI runs Phase 101 plus Phases 96–100 tests.

## Remaining release qualification

This phase closes the source-level event-registration gaps. It does not by itself prove full wire-protocol compatibility with every deployed client or multi-instance Socket.IO behavior. Before production cutover, run authenticated two-user and multi-user integration tests against isolated staging, including reconnects, multiple tabs, simultaneous join/start races, moderator removal, network loss, and server restart. If deploying more than one server instance, configure a shared Socket.IO adapter and shared call-state coordination; in-memory maps are single-instance only.

No live SQLite runtime, Render service, Supabase project, production database, or production data is changed by this phase.
