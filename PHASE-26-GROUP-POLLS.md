# Phase 26 — Group Polls and Voting

## Scope
- Any current group member can create a poll.
- Polls support 2–10 distinct answer options.
- Polls support single-choice or multiple-choice voting.
- Every group member can see live vote totals and results.
- A poll creator or group admin can close an open poll.
- Closed polls remain visible with their final results.

## Data model
- `group_polls`: group, creator, question, voting mode, open/closed state and timestamps.
- `group_poll_options`: options belonging to a poll.
- `group_poll_votes`: one row per member/option selection, protected by a composite primary key.
- Foreign keys cascade poll deletion to options and votes.

## Authorization and validation
- Poll listing and voting require current group membership.
- Poll creation requires current group membership.
- Closing requires the poll creator or a group admin.
- Closed polls reject new votes.
- Questions are limited to 300 characters; options to 2–10, each 1–100 characters.
- Duplicate options are rejected case-insensitively.
- Submitted option IDs are checked against the selected poll.
- Re-submitting a vote replaces the member's previous selection, including multiple-choice selections.
- Voter identities are not exposed in the results response.

## Realtime and interface
- Poll create, vote and close actions emit `group:polls:updated` to the authenticated group room.
- Group members refresh poll results when that event arrives.
- The group panel includes poll creation, voting controls, vote counts and result bars.
- Results remain visible after closure.

## Validation performed
- JavaScript syntax checks passed for `src/db.js`, `src/routes/groups.js`, and `public/app.js`.
- SQLite migration simulation passed.
- Vote uniqueness and cascading poll deletion checks passed.

## Deployment status
This phase is on the isolated development branch `waltajjii-group-polls-voting-phase26`. It has not been merged or deployed to production. Runtime API and multi-account browser testing are still required on the test service before approval.
