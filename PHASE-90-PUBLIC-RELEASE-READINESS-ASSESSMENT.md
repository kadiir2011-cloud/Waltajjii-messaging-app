# Phase 90 — public-release readiness assessment

## Decision

**NOT READY FOR UNRESTRICTED PUBLIC LAUNCH.**

This is a static repository audit and evidence checklist, not a live Render inspection, penetration test, legal certification, or disaster-recovery certification. The assessment deliberately distinguishes implemented controls from items that still require actual infrastructure evidence.

## Positive progress verified in source and CI
- JWT issuer/audience checks and authenticated Socket.IO handshakes.
- Shared HTTP/Socket.IO origin policy and Helmet security headers.
- Authentication rate-limit policy and disposable-database regression tests.
- PostgreSQL schema and disposable migration-rehearsal tooling.
- Private Supabase Storage service foundation.
- Phase 86 session-claim policy tests.
- Phase 87 secure recovery-token primitive tests.
- Phase 88 cross-layer JWT, profile, Socket.IO and origin verification.
- Phase 89 isolated concurrency baseline. The CI fixture reported 120 HTTP profile requests at p50 15.7 ms / p95 49.4 ms and 200 Socket.IO token handshakes in 11.7 ms. These are synthetic CI measurements, not a production capacity estimate.

## Critical release blockers
1. **Durable system of record:** the live server still imports the SQLite database module. The opt-in PostgreSQL API composition is not yet the live runtime. A fixture migration rehearsal does not migrate the actual user database.
2. **Durable media:** upload and Moment routes still fall back to local files when Supabase Storage is not configured. Production must fail closed if durable storage is unavailable.
3. **Verified recovery:** no verified backup/restore of the actual database and media inventory is established by repository CI.
4. **Session lifecycle:** the session-claim helper is not integrated into the live auth route; there is no demonstrated per-device session inventory, revocation or account-wide invalidation.
5. **Account recovery:** token primitives exist, but the live auth route has no complete persistence, single-use reset flow, verified delivery or session revocation.
6. **Shared rate limiting:** the Redis REST adapter exists, but the live login/registration limiters do not yet use a shared store.
7. **Multi-instance coordination:** live presence and call state remain process-local.
8. **File validation:** inspected upload filtering relies on client-provided MIME metadata; actual file-signature validation is not established.
9. **Operational readiness:** the current health endpoint is static and does not prove database/storage readiness.
10. **Hosting configuration:** no repository Render Blueprint or Dockerfile is present. Confirm the actual hosting dashboard configuration, including persistence, scaling, environment secrets, health checks and rollback.

## Additional manual gates
- Verify the real Render service plan, persistent storage, database endpoint, TLS, backups, autoscaling and deploy settings without sharing secrets.
- Export the actual database and media inventory; restore both into an isolated environment and reconcile counts/checksums.
- Run a full staging migration and multi-account end-to-end test against realistic data.
- Verify Supabase private-bucket access, object ownership, object existence, cleanup and recovery.
- Complete account deletion/data export, privacy notice, terms of use, support contact, abuse reporting, moderation and incident-response procedures.
- Run a monitored load test against production-like staging; do not send load to the live public app.
- Review all high-risk routes and media/object authorization for IDOR and cross-account access.
- Approve a staged pilot before enabling broad public registration.

## Release policy
Do not merge the readiness phase or switch the production database, environment, storage, or Render deployment as part of this audit. Do not invite unrestricted public users until critical and high-severity gates are closed with evidence and explicit approval.

## Files
- `scripts/phase90-public-release-readiness-audit.js` — machine-readable static audit.
- `test/phase90-public-release-readiness-audit.test.js` — verifies the release decision and recorded positive controls.
- `.github/workflows/phase90-public-release-readiness-audit.yml` — runs the audit in CI.

The audit intentionally exits with status 2 while launch blockers remain. This is a release hold, not a failure of the individual feature tests.
