# Phase 51 — PostgreSQL social and feed parity

## Implemented (isolated draft)
- Member discovery with profile-mode privacy filtering, follow state, follower/following counts and connection status.
- Follow/unfollow with duplicate-safe inserts and notifications.
- Connection requests, incoming/outgoing lists, accept/decline, reciprocal follows on acceptance, and notifications.
- Followers and following lists.
- Feed limited to the authenticated user's own posts and posts by followed members.
- Post creation, like/unlike, comment listing/creation and notification creation.
- Notification listing and mark-all-read.
- PostgreSQL transactions for connection request decisions and multi-row operations; IDs remain BIGINT strings.

## Verification
A disposable PostgreSQL 16 HTTP integration test covers authentication, privacy-aware discovery, duplicate follow behavior, notifications, connection request direction and acceptance, reciprocal follows, feed visibility, like toggling, comments, and notification read state.

## Scope and safety
This adds an isolated PostgreSQL service/router and tests. It does not replace \`src/routes/social.js\`, mount the router in \`src/server.js\`, or switch the running application from SQLite. It does not execute SQL against live Supabase or deploy to Render. UI/API contract parity must still be reviewed before eventual runtime integration.
