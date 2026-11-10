# Phase 53 — PostgreSQL group governance, polls, events and reminders

## Implemented in this isolated draft
- Admin role changes with protection against removing the last admin; member leave/removal with last-admin protection.
- Group details, rules, public/private visibility, approval-required setting and member-list privacy.
- Member-visible paginated group activity history.
- Secure group invitation links: cryptographically random token, SHA-256 token hash at rest, configurable expiry (1 hour/1 day/7 days/30 days), optional use limit, preview, admin listing, revocation and atomic join/use-count consumption.
- Invitation-based join requests, admin approval/rejection, invitation validity re-check at approval and member-cap enforcement.
- Group polls: create, options, single/multiple choice, vote replacement, poll close by creator/admin, vote tally and selected state.
- Group events: schedule, description/location, reminder interval, RSVP changes, attendee lists/counts and creator/admin cancellation.
- PostgreSQL reminder delivery method with transactional deduplication using the unique event/member delivery key and notification creation.

## Security and data behavior
- All protected routes require Waltajjii JWT issuer/audience validation.
- Membership/admin checks are enforced inside transactional service methods.
- Invitation raw tokens are returned only at creation; only SHA-256 hashes are stored and hashes are never exposed in list/preview responses.
- PostgreSQL BIGINT identifiers remain decimal strings.
- Reminder delivery is idempotent per event/member and writes notification plus delivery marker in one transaction.

## Verification
A disposable PostgreSQL 16 integration test exercises HTTP routes and database effects for group settings, role management, invitation creation/preview/join/use limits/revocation, approval and rejection, poll creation/voting/closing, event creation/RSVP/cancellation, membership leave/removal, last-admin protection and idempotent event reminders.

## Safety boundary
The production SQLite group router and reminder worker remain unchanged. This new router/service are isolated and are not mounted in \`src/server.js\`. The workflow uses disposable CI PostgreSQL only. No real Supabase SQL, Render configuration, merge or deployment is performed.
