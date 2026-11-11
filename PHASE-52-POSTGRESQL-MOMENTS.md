# Phase 52 — PostgreSQL Moments parity

## Implemented (isolated draft)
- Create text or media Moments with a 500-character text limit and audience validation.
- List unexpired Moments visible to the viewer: own Moments, everyone-audience Moments, and followers-audience Moments only when the viewer follows the author.
- Enforce the same visibility rule for media reads; unauthorized requests receive a not-found response.
- Owner-only deletion.
- PostgreSQL expiry cleanup uses TIMESTAMPTZ comparisons and returns expired media object paths for storage cleanup.
- Media storage/delivery is injected into the router so the PostgreSQL persistence layer does not assume a local filesystem.

## Verification
Disposable PostgreSQL 16 HTTP tests cover authentication, follower privacy, public visibility, owner visibility, invalid input, authorized/unauthorized media reads, owner-only deletion, expired row cleanup and expired-media cleanup callbacks.

## Safety
The existing SQLite \`src/routes/moments.js\` remains mounted in production. This PostgreSQL implementation is isolated; it does not change the live app, Supabase or Render. Durable media object-storage integration and route/UI contract review remain required before production wiring.
