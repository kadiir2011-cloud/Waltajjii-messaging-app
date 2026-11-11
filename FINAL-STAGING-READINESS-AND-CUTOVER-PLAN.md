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
- PR #29 (Phase 27 group events) is closed as merged into the Phase 29 feature branch, not directly into `main`; confirm its event/RSVP changes are present in the eventual integrated product branch. PRs #30–#34 continue the profile, presence, reminders and language work.

### B. PostgreSQL migration stack

The newer migration work is a dependency stack, not a set of independent PRs:

1. PR #35 — production readiness/security audit.
2. PR #36 — PostgreSQL adapter foundation.
3. PR #37 and PR #38 both target the Phase 33C parent and change the same five files (416 additions each). A commit comparison shows PR #38 is one commit ahead of PR #37, with the only difference being branch filters in the Phase 34 workflow. PR #38 contains the PR #37 content plus that workflow correction; PR #39 is based on PR #38. Treat PR #38 as canonical and do not merge PR #37 separately.
4. PRs #39–#46 — realtime foundation, test harness, schema contract, poll integrity, timezone contract, migration blueprint, schema reconciliation and disposable integration.
5. PRs #47–#52 — auth/profile integration, realtime Socket.IO, direct messaging, groups, channels and channel interactions.
6. PRs #53–#59 — migration-chain audit, application integration audit, social/feed, Moments, group governance, durable media and full network Socket.IO integration.
8. PR #60 — API/frontend compatibility and regression baseline.
9. PR #61 — read-only SQLite migration preflight.
10. PR #62 — disposable PostgreSQL migration rehearsal.

**Recommended integration discipline:** review each PR's diff and CI at its exact head SHA; resolve sibling branches and alternatives first; integrate in dependency order into a protected integration branch; rerun the complete regression suite after each logical batch. Keep the live `main` and Render service unchanged until staging gates are signed off. A green CI badge on a child branch does not automatically prove every parent PR has been reviewed or safely integrated.

## 2. Blocking work before staging can be considered ready

### Gate 0 — Repository consolidation and code review

- Review PRs #1–#62, including security-sensitive backup/export changes.
- Combine Phase 7 siblings (#8/#9) after a same-file conflict review; select/rebuild one coherent Phase 15 forwarding implementation (#15 versus #17), preserve Phase 16 deletion (#18) on the chosen base, review PR #16 separately as a sensitive backup utility, and use PR #38 as canonical rather than merging duplicate PR #37.
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


## Gate 0 — verified repository audit (11 November 2026)

This section records a live GitHub metadata and diff audit. It is a repository review only; no branch was merged, no PR was closed, and no deployment or database action was performed.

### Verified branch relationships

| Workstream | Verified GitHub relationship | Gate 0 decision |
|---|---|---|
| PRs #1–#7 | Sequential feature chain from `main` through profile, social, channels, reliability, Moments, voice and personalization | Preserve the chain; review the complete diff stack and test on isolated staging |
| PRs #8 and #9 | Both branch from the exact Phase 7 commit; both change `public/app.js` and `public/index.html` | Sibling integration required; combine carefully and rerun browser/mobile tests |
| PRs #10–#14 | Sequentially continue from the Phase 9 navigation lineage | Keep in sequence |
| PRs #15 and #17 | Both branch from the exact Phase 14 commit and diverge; both modify `public/app.js`, `src/db.js`, and `src/routes/messages.js`; PR #17 additionally changes `src/server.js` | Do not merge both. Review behavior and migrations, select one forwarding implementation |
| PR #18 | Based on PR #17's `waltajjii-phase15-rebuild` head | Preserve deletion work only on the selected/reconciled Phase 15 base |
| PR #16 | Separate branch from Phase 14 for temporary protected SQLite backup export | Security-sensitive standalone review; do not include automatically in the public application |
| PR #19–#28 | Sequential feature stack after PR #18 | Preserve sequence; check cumulative frontend and SQLite migration compatibility |
| PR #29 | Closed/merged; title Phase 27 group events; target branch is the Phase 29 feature branch, not `main` | Confirm its changes are retained in the product integration lineage |
| PR #30–#34 | Sequential Phase 28–32 profile, live presence, reminders and language work | Preserve sequence; verify PR #29's merged content is included |
| PR #35–#36 | Sequential production-readiness audit and PostgreSQL adapter foundation | Preserve sequence |
| PR #37 and #38 | Same five changed paths and 416 additions; compare shows PR #38 is one commit ahead, differing only in the Phase 34 workflow branch filters | PR #38 is canonical; do not separately merge duplicate PR #37 |
| PR #39–#62 | Continuous PostgreSQL stack from PR #38 through Phase 58; each child base SHA matches the preceding branch head | Preserve exact dependency order and rerun CI after integration batches |
| PR #63 | This planning PR, based on PR #62 | Documentation only |

### Additional checks and outstanding Gate 0 evidence

- The complete open-PR inventory was retrieved from GitHub. PR #29 is the notable closed/merged exception; it was merged into a feature branch, not `main`.
- The Phase 15 comparison confirms that PR #15 and PR #17 are divergent histories. PR #15 combines forwarding and deletion in one implementation; PR #17 rebuilds forwarding, and PR #18 adds a separate deletion design on top of PR #17. PR #18 uses a `message_hidden_for` table for per-user hiding and a tombstone for global deletion. PR #17/#18 currently have no PR-triggered workflow runs associated with their audited head commits, so automated tests must be added before approval.
- PR #8/#9 also have no PR-triggered workflow runs associated with their audited head commits. Their same-file sibling integration therefore needs automated desktop/mobile regression tests.
- PR #16 mounts a Basic-authenticated database export endpoint at `/api/backup/export`. Although it checks credential length, compares credentials timing-safely and deletes the temporary file after delivery, it exposes a full database export route in the application server. Keep it out of the public runtime; if retained for a controlled one-time backup, require a time-limited operational procedure, strong secret handling, rate limiting/monitoring and immediate removal/disablement afterward.
- The Phase 33 comparison confirms that PR #38 contains the PR #37 commit and one additional workflow correction; the current PR #39 base is PR #38.
- PR #29 is already merged to the Phase 29 feature branch. Verify the group-event implementation is present in the chosen product integration branch before any cutover.
- PR metadata showing `mergeable: true` is not a substitute for a full integration test, and a successful CI run on a child branch is not approval to merge.
- Still required before Gate 0 exit: inspect full diffs and current CI for every retained PR at its current head SHA; verify no secrets or unsafe debug endpoints; inspect SQLite migration idempotency/order; test combined sibling feature branches; resolve any stale workflow branch filters; and produce a green integrated regression run.
- No changes to production `main`, Render, Supabase, or the live application database are included.

**Gate 0 status: IN PROGRESS — dependency map and major branch conflicts verified; full diff/security/CI review and consolidated integration branch validation remain.**
