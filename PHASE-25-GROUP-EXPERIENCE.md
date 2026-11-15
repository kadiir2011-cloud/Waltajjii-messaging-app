# Phase 25 — Advanced Group Experience

Status: implementation in progress. This branch is based on the tested Phase 24 code. Do not merge or deploy to production until the implementation and test checklist are complete.

## Scope and delivery order

### 25A — Secure invitation links and QR joining
- Admins can create revocable invitation links with a configurable expiry (1 hour, 1 day, 7 days, or 30 days).
- Store only a cryptographic hash of each invitation token; never store or log the raw token.
- Validate expiry, revocation, group capacity, and existing membership on every join attempt.
- QR codes encode the same invitation URL; QR display is a client-side presentation of the URL, not a separate authorization mechanism.
- Invitation preview must not reveal private group messages or member details.

### 25B — Join approval
- Group admins can enable or disable approval for invitation-based join requests.
- With approval enabled, a valid invite creates a pending request; it does not create membership or grant access to messages.
- Admins can approve or reject requests. Approval re-checks the invitation, group capacity, and existing membership inside a transaction.
- Realtime updates notify group admins of requests and notify the requester of the decision.

### 25C — Group details and privacy
- Add bounded group description and rules fields.
- Add explicit group visibility and join policy settings.
- Existing groups retain safe defaults and existing member access.
- Only admins can edit group details and privacy settings.

### 25D — Membership activity history
- Record join, leave, add, remove, role change, invitation create/revoke, and approval/rejection events.
- Members see only the history permitted by group policy; sensitive invite tokens are never included.
- History is paginated and newest-first.

## Security and compatibility requirements
- All endpoints use the existing JWT authentication and verify current group membership/role server-side.
- Every mutation is authorized on the server; hiding a UI control is not authorization.
- Invitation tokens are high entropy, hashed at rest, revocable, and time-limited.
- Pending applicants cannot read group messages, receipts, pinned messages, or member lists.
- Use SQLite transactions for multi-step state changes and preserve existing data through additive migrations.
- Existing group messaging, media, voice notes, reactions, replies, edits, deletions, announcements, pinning, read receipts, typing, presence, and Phase 24 administration must remain intact.
- No production deployment or merge as part of this phase's testing.

## Acceptance checklist
- [x] Create expiring invite as admin; non-admin creation is rejected by the API (implementation added; runtime test pending).
- [ ] Invite URL opens a safe preview without exposing private content.
- [ ] QR code resolves to the same invite URL (not implemented yet).
- [x] Valid invite joins immediately (approval workflow is not yet implemented; runtime test pending).
- [ ] Valid invite creates a pending request when approval is on.
- [ ] Pending user cannot access group content before approval.
- [ ] Admin can approve/reject; duplicate requests are handled safely.
- [x] Expired and revoked invites are rejected by API validation (runtime test pending).
- [ ] Realtime membership/request updates work across two accounts.
- [ ] Group description, rules, privacy, and history permissions are enforced.
- [ ] Existing Phase 23/24 regression checklist passes.


## 25A implementation status (2026-11-08)
- Added additive SQLite tables for invitation records and invitation events.
- Added admin-only create/list/revoke endpoints, authenticated invite preview and join endpoints.
- Invitation tokens use 256-bit random values; only SHA-256 hashes are stored.
- Expiry choices: 1 hour, 1 day, 7 days, 30 days; optional use limit supported.
- Added admin invitation panel with create, copy, list and revoke controls.
- Runtime deployment and two-account tests are still pending. QR presentation and invite landing/join UI remain to be completed.


## Phase 25B implementation update

- Added browser-side QR rendering for newly created invitation links. The QR matrix is generated locally in the browser using the Qrious library; the invitation URL is not submitted to a remote QR image-generation service.
- Added a login-aware invitation landing flow for links using the `?groupInvite=` query parameter. After sign-in, the app fetches the safe invitation preview, displays the group name and expiry, and offers an explicit Join group action.
- Joining calls the authenticated invitation join endpoint, refreshes the user's groups, opens the joined group, and removes the invitation token from the browser address bar after a successful join.
- These changes are committed to the Phase 25 development branch. They have not yet been runtime-tested or deployed. The invitation landing requires the user to sign in before joining.


## Phase 25B-D implementation update

### Join approval
- Added an additive pending-request table with one pending request per user per group.
- Invitation joins respect the group's approval-required setting. When enabled, the applicant receives HTTP 202 and a pending status; no membership row, group socket-room access, message access, or member-list access is granted.
- Admin-only endpoints list pending requests and approve/reject them.
- Approval revalidates the invitation's expiry, revocation, use limit, and group capacity inside a SQLite transaction before consuming a use and creating membership.
- Realtime notifications are emitted to the group and the applicant on request/decision changes.

### Group details and privacy
- Added bounded description (500 characters) and rules (2,000 characters).
- Added an admin-controlled setting that restricts the member list to admins or allows all members to view it. The API enforces this restriction, not just the UI.
- Added an admin-controlled approval-required switch for invitation-based joins.
- Existing groups receive safe defaults: blank description/rules, member-visible member list, and approval disabled.

### Membership activity
- Added a group activity table and paginated, newest-first member-only history endpoint.
- Records group creation, direct additions/removals, leave, role changes, invitation creation/revocation, join requests, approvals/rejections, and group setting changes.
- Activity records contain no invitation tokens or token hashes.

### UI
- Added group settings, pending join-request review, and activity-history panels.
- Added read-only group detail viewing for non-admin members; editing and request review controls are admin-only.

### Validation status
- JavaScript syntax parsing succeeded for `src/db.js`, `src/routes/groups.js`, and `public/app.js` after these changes.
- A SQLite migration simulation passed, including the partial unique index that prevents duplicate pending requests for the same user/group.
- Runtime/API tests, database migration execution against the deployed database, two-account security tests, and Render test deployment are still pending.
- The Phase 25 PR remains a draft and must not be merged or deployed to production.
