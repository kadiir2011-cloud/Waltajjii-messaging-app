# Waltajjii — Final staging-readiness and production cutover plan

**Status:** Planning document only. No merge, deployment, production database change, Supabase change or Render change is authorized by this plan.

## Executive assessment

The project has completed substantial feature work and isolated PostgreSQL development, including a successful disposable SQLite-to-PostgreSQL migration rehearsal in Phase 58. It is **not yet ready for public launch**.

The current production/test runtime is still SQLite. The PostgreSQL application composition is opt-in and has not been mounted in the live server. Phase 56 also records outstanding browser E2E, complete API parity, reminder-worker staging validation, media lifecycle, security/performance and rollback work. The actual user SQLite database has not been inspected with Phase 57, and the actual Supabase Storage objects have not been reconciled.

The purpose of this plan is to establish a controlled, evidence-based route from the existing test deployment to public service.

## 1. Pull-request dependency review

All PRs listed below were observed open and in draft state at the time of this review. Their branch relationships matter: do not merge them in arbitrary order or treat an open PR as integrated.

### A. Product feature stack

- PR #1 begins the profile redesign chain from `main`.
- PRs #2–#7 continue the feature chain.
- PR #8 (Low-Bandwidth Mode) and PR #9 (navigation/responsive workspace) are sibling branches based on Phase 7. PR #8 is not in PR #9's ancestry; decide whether to integrate it or explicitly defer it.
- PRs #10–#14 continue the PR #9 lineage.
- PR #15 (forward/delete) and PR #17 (Phase 15A rebuild) are alternative branches from Phase 14 addressing overlapping functionality. Review their diffs and retain one coherent implementation; do not merge both blindly.
- PR #16 is a temporary protected SQLite backup-export change. Treat it as a security-sensitive utility, not an ordinary product feature. Review access control, output protection, retention and removal/disablement before deciding whether it belongs in production.
- PRs #18–#28 continue the product feature chain.
- PR #30–#34 continue the later profile, presence, reminders and language work. PR numbering gaps should be checked in GitHub before deciding whether any omitted work is required.

### B. PostgreSQL migration stack

The newer migration work is a dependency stack, not a set of independent PRs:

1. PR #35 — production readiness/security audit.
2. PR #36 — PostgreSQL adapter foundation.
3. PR #37 — compatibility audit is a sibling of PR #38, both based on PR #36. It is not in the PR #38 ancestry; reconcile its findings/changes before integration.
4. PR #38 — auth/profile PostgreSQL routes; PRs #39–#36 onward follow this lineage.
5. PRs #39–#46 — realtime foundation, test harness, schema contract, schema reconciliation and disposable integration.
6. PRs #47–#52 — auth/profile, realtime Socket.IO, direct messaging, groups, channels, channel interactions and Moments/social integration.
7. PR #53–#59 — migration-chain audit, integration-readiness audit, Moments, group governance, durable media and full network Socket.IO integration.
8. PR #60 — API/frontend compatibility and regression baseline.
9. PR #61 — read-only SQLite migration preflight.
10. PR #62 — disposable PostgreSQL migration rehearsal.

**Recommended integration discipline:** review each PR's diff and CI at its exact head SHA; resolve sibling branches and alternatives first; integrate in dependency order into a protected integration branch; rerun the complete regression suite after each logical batch. Keep the live `main` and Render service unchanged until staging gates are signed off. A green CI badge on a child branch does not automatically prove every parent PR has been reviewed or safely integrated.

## 2. Blocking work before staging can be considered ready

### Gate 0 — Repository consolidation and code review

- Review PRs #1–#62, including security-sensitive backup/export changes.
- Resolve the Phase 7 sibling branch (#8/#9), Phase 14 alternatives (#15/#17), and Phase 33 sibling audit (#37/#38).
- Check all open PRs for stale bases, conflicts, missing CI, unreviewed secrets, generated files and unintended changes.
- Confirm the final integration branch contains the intended user-facing features without duplicate routes or competing implementations.
- Keep all PRs draft until their review and required checks are complete.

**Exit evidence:** approved integration map, clean dependency order, required checks green, no unresolved high/critical review findings.

### Gate 1 — Real SQLite source readiness (read-only)

- Make a protected, consistent backup copy of the actual application SQLite database.
- Preserve any local uploads directory and record its inventory separately.
- Run Phase 57 preflight only against the copy, never against a live database file being written.
- Review integrity, foreign keys, required tables, row counts, ID ranges, username collisions, timestamp anomalies and media-reference categories.
- Resolve every reported blocker before any staging import.

**Exit evidence:** dated backup checksum, Phase 57 report, exception register and approved mapping decisions. No real user data has been audited yet.

### Gate 2 — Media and file reconciliation

- Inventory the private `waltajjii-media` Supabase bucket and compare it with references in the SQLite backup.
- Confirm object ownership, purpose, parent record, MIME type, byte size, access permissions and object existence.
- Identify missing objects, unreferenced/orphan objects, duplicate references and legacy local-upload paths.
- Verify private signed/authorized reads and membership checks for direct, group, channel, profile and Moments media.
- Test deletion, expiry cleanup, forwarding/reference retention and orphan cleanup policies.
- Never make the bucket public merely to simplify migration.

**Exit evidence:** object-to-record reconciliation report, unresolved-object list, tested access-control matrix and recovery procedure.

### Gate 3 — Isolated staging infrastructure

- Provision a separate PostgreSQL staging database with reviewed migrations applied in order.
- Use staging-only credentials and secrets. Do not copy production service-role keys into client code or repository files.
- Use durable media storage; verify that the application does not depend on ephemeral Render filesystem paths.
- Replace the Render Free/no-persistent-disk arrangement before public use, or otherwise demonstrate a fully stateless design with all durable state in PostgreSQL and Supabase Storage.
- Configure TLS with certificate verification, least-privilege database roles, backups, connection limits, health checks and monitoring.
- If more than one application instance will run, add a shared Socket.IO adapter/presence strategy (for example Redis) and verify cross-instance events. The Phase 55 implementation is single-process.

**Exit evidence:** isolated staging URL, infrastructure diagram, secret inventory, backup policy and successful health/restore checks.

### Gate 4 — Complete PostgreSQL runtime integration

- Convert every remaining SQLite-coupled HTTP route, Socket.IO event, scheduler and background worker to the PostgreSQL services.
- Wire the PostgreSQL composition into a staging-only server entry point first; do not switch the production entry point yet.
- Wire the Phase 53 reminder delivery method into the scheduler with overlap protection, retries, idempotency and graceful shutdown.
- Verify all route and socket authorization checks, pagination, error contracts, rate limits and transaction boundaries.
- Confirm BIGINT IDs remain strings end-to-end, timestamp semantics remain consistent, and username uniqueness is case-insensitive.
- Remove SQLite-only assumptions from runtime paths; keep a tested rollback path until cutover is explicitly approved.

**Exit evidence:** route/socket/worker inventory showing every feature has a PostgreSQL implementation and test; no unconverted SQLite dependency in the staging runtime.

### Gate 5 — Full regression, security and performance

Required coverage:
- Browser E2E on desktop and mobile for registration, login, profile, contacts, direct/group/channel messaging, media, replies, reactions, receipts, calls, translation, feed, Moments, polls, events and reminders.
- Multi-session and reconnect behavior, unauthorized access, cross-user and cross-group media access, expired invitations and deleted/expired content.
- Reminder scheduler lifecycle, duplicate prevention, retries, delivery and monitoring.
- Backup/restore, migration interruption, transaction rollback and recovery from missing media.
- Load/concurrency testing for HTTP, WebSockets, PostgreSQL pool, storage and worker processes.
- Security checks for authentication/session handling, CSRF/CORS policy as applicable, input validation, rate limits, abuse controls, secret leakage, dependency vulnerabilities, logging of private data and account/data deletion.
- Accessibility, low-bandwidth behavior, error states and browser compatibility.

**Exit evidence:** test reports, security findings with remediation, load results, monitoring/alert tests and accepted residual-risk register.

### Gate 6 — Migration and rollback rehearsal

- Use a protected copy of the real SQLite backup and a fresh staging PostgreSQL database.
- Run Phase 57 preflight, resolve exceptions, then execute the migration rehearsal with production-like data volumes.
- Verify table counts, per-table checksums or equivalent row-level parity, foreign keys, identity sequences, timestamps and representative user journeys.
- Reconcile actual Storage objects and test sampled media access after import.
- Measure migration duration and define a write-freeze/cutover window.
- Restore the pre-migration backup into a clean environment and prove the rollback procedure.
- Define a clear stop/go decision and an owner for each cutover action.

**Exit evidence:** signed migration report, restore report, rollback report, timed cutover runbook and approved recovery point.

## 3. Controlled production cutover (requires separate explicit approval)

Only after Gates 0–6 pass:

1. Announce a maintenance/write-freeze window and take a final verified backup.
2. Run final preflight and migration to the production PostgreSQL target using the reviewed runbook.
3. Reconcile and verify media objects.
4. Deploy the PostgreSQL runtime with production secrets and health checks.
5. Run smoke tests for authentication, messaging, groups, channels, media, calls, notifications and reminders.
6. Monitor errors, database load, WebSocket connections, storage access and queue/worker health.
7. Keep the SQLite backup and rollback route protected until the agreed stabilization period ends.
8. Expand access gradually; do not invite the general public until the owner approves the final go-live checklist.

This document does not grant approval to perform any of these production actions.

## 4. Current decision

**Decision: NOT READY for public launch yet.**

The Phase 58 CI result is a successful controlled fixture rehearsal, not a migration of the user's actual database. The actual SQLite data, actual Supabase Storage objects, integrated PostgreSQL runtime and staging rollback have not yet been verified.

**Next safest action:** complete Gate 0 by reconciling the outstanding PR stack and sibling/alternative branches, then prepare the protected actual-database backup and read-only Phase 57 audit. Do not change the Render production service or live Supabase project during this review.
