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
- [ ] Create invite as admin; non-admin creation is rejected by the API.
- [ ] Invite URL opens a safe preview without exposing private content.
- [ ] QR code resolves to the same invite URL.
- [ ] Valid invite joins immediately when approval is off.
- [ ] Valid invite creates a pending request when approval is on.
- [ ] Pending user cannot access group content before approval.
- [ ] Admin can approve/reject; duplicate requests are handled safely.
- [ ] Expired and revoked invites are rejected.
- [ ] Realtime membership/request updates work across two accounts.
- [ ] Group description, rules, privacy, and history permissions are enforced.
- [ ] Existing Phase 23/24 regression checklist passes.
