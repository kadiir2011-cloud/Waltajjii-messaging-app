# Waltajjii Phase 2 — Social Connections

This development branch adds the first social-networking layer on top of the profile version.

## Included
- Member discovery and search by username, biography, professional title, organization and department.
- One-way follow and unfollow.
- Connection requests with accept/decline. Accepting a request creates mutual follows.
- Followers and following lists.
- A personalized text-post feed containing the current user's posts and posts from followed members.
- Post likes and comments.
- Notifications for follows, connection requests, accepted requests, likes and comments.
- Profile-mode visibility is respected for discovery and incoming request summaries.

## API
All endpoints require the existing Waltajjii Bearer login token and are mounted under `/api/social`.

- `GET /discover?q=`
- `POST /follow/:userId` and `DELETE /follow/:userId`
- `POST /connect/:userId`
- `GET /requests`
- `POST /requests/:requestId/respond` with `{ "action": "accept" }` or `{ "action": "decline" }`
- `GET /followers` and `GET /following`
- `GET /feed`
- `POST /posts` with `{ "content": "..." }`
- `POST /posts/:postId/like`
- `GET /posts/:postId/comments`
- `POST /posts/:postId/comments` with `{ "content": "..." }`
- `GET /notifications`
- `POST /notifications/read`

## Test sequence
1. Register or use two non-production test accounts on the test deployment.
2. Search for the second account from the first account.
3. Follow the second account and verify the follower/following lists.
4. Send a connection request; accept it from the second account.
5. Publish a post from the second account; verify it appears in the first account's feed after following.
6. Like and comment on the post; verify notifications on the post owner's account.
7. Confirm existing direct messages, groups, profile editing and media upload still work.

## Current boundaries
- Contact-book synchronization is not included. Discovery is username/profile search only; importing phone contacts would require a separate explicit opt-in and privacy design.
- Posts are text-only in this initial phase.
- This branch is for testing. Do not merge into production until the tests pass and a durable database/persistent-storage plan is in place. Render's ephemeral filesystem can erase SQLite data during redeploys.
