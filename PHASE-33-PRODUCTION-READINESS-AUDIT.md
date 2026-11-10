# Phase 33 — Production Readiness and Security Audit

## Status
Initial source-code audit completed on `waltajjii-production-readiness-phase33`, based on Phase 32. This is a code review, not a penetration test or a production certification. No production deployment or data migration was performed.

## Executive summary
Waltajjii has a substantial feature set and several sound foundations: password hashing with bcrypt, signed JWT authentication, parameterized SQL queries in the inspected routes, authenticated Socket.IO connections, per-route authorization checks in major messaging/group flows, Helmet, request-size limits, and server-side Supabase credentials.

It is **not yet ready for unrestricted public launch**. The following launch blockers and high-priority items require remediation and verification.

## Findings

### Critical — database durability is not established
- `src/db.js` places SQLite at `STORAGE_DIR/waltajjii.db`, or `data/waltajjii.db` when `STORAGE_DIR` is unset.
- Supabase integration in `src/storage.js` is for object/media storage only; it does not persist the SQLite database.
- A local SQLite file on an ephemeral application filesystem can be lost on redeploy/restart or unavailable if multiple service instances are used.
- Before launch, choose and implement a durable database architecture (prefer managed PostgreSQL/Supabase Database for a multi-user public service, or a properly mounted persistent disk for a single-instance interim deployment). Plan and test a safe migration preserving all existing records and relations.

### Critical — local media fallback can silently be non-durable
- `src/routes/uploads.js` and `src/routes/moments.js` fall back to local filesystem storage when Supabase Storage is not configured.
- The app can therefore accept uploads that appear successful but may disappear on an ephemeral host.
- Production mode should fail closed if durable media storage is not configured; verify bucket access, private-object authorization, MIME/content validation, size limits, cleanup, and restore procedures.

### High — CORS policy is unrestricted
- `src/server.js` currently applies `app.use(cors())`, which permits browser requests from any origin.
- Restrict HTTP CORS and Socket.IO origins to the approved production and test application origins. Keep local development origins in development only.

### High — upload validation trusts client-provided MIME metadata
- Upload filters primarily validate `file.mimetype`; this value is supplied by the client and does not prove the bytes match the declared file type.
- Add file-signature/content inspection for supported formats, reject mismatches, and consider malware scanning/quarantine for public uploads. Preserve current file size caps and allowed file types.

### High — rate limiting is process-local
- Global and authentication/translation limits use the default in-memory rate-limit store.
- Limits reset on restart and are not shared across multiple instances. For a public multi-instance deployment, use a shared store and separate limits for login, registration, messaging, uploads, and expensive endpoints.

### High — registration and account lifecycle need launch controls
- Registration currently creates an account using username and password only; no email/phone verification or public-registration control was found in the inspected authentication route.
- Decide whether launch is invite-only or open. Add abuse prevention, account recovery, session/device management, and a verified account-deletion/data-export workflow before broad public registration.

### High — privacy and user-safety workflow needs a dedicated review
- Review profile discoverability, message/media access, group/channel membership transitions, blocking, reporting, spam, impersonation, harassment, moderation queues, and administrator audit trails end-to-end.
- Do not assume a feature is absent solely because it was not included in this initial sample; verify every route and UI path in the next audit pass.

### Medium — operational health and monitoring are incomplete
- `/health` currently returns a static `{ status: "ok" }` and does not verify database readiness or storage configuration.
- Add structured, privacy-conscious logs, dependency/database health checks, error monitoring, uptime alerts, backup alerts, and a documented incident response procedure. Avoid logging message content, tokens, secrets, or unnecessary personal identifiers.

### Medium — process-local online presence and scheduled jobs
- Online presence and active call tracking use in-memory Maps in `src/server.js`; they are not shared between instances and are cleared on restart.
- The group-event reminder worker runs inside the application process. On a free/spun-down service it may not run at the intended time.
- Use a shared presence adapter/store and a durable scheduled-job mechanism if scaling or reliable timed delivery is required.

### Medium — Socket.IO origin configuration must be verified
- Socket.IO uses `CLIENT_URL` or defaults to `http://localhost:3000`.
- Set and verify the exact test and production origins, and align the policy with the HTTP CORS configuration.

## Positive controls observed
- Passwords are hashed with bcrypt (cost factor 12).
- JWTs include issuer, audience, and a two-hour expiry.
- Major inspected API routes authenticate requests; group/channel/media access includes membership/ownership checks.
- SQL values are generally passed as prepared-statement parameters in inspected routes.
- Supabase credentials are read server-side; they are not embedded in browser code.
- Uploads have explicit file-size caps and random UUID filenames.
- Helmet is enabled and JSON request bodies are size-limited.

## Phase 33 remediation order
1. Confirm actual Render environment and persistence configuration without exposing secrets.
2. Select the durable database architecture and write a non-destructive migration/backup plan.
3. Make media storage fail closed in production when durable storage is unavailable; validate file contents.
4. Restrict HTTP and Socket.IO CORS origins.
5. Introduce shared rate limiting and improve registration abuse controls.
6. Complete privacy, moderation, account lifecycle, and administrator authorization review.
7. Add health/monitoring/backup verification and repeat regression tests.

## Safety rules
- Keep all work on this isolated branch and the test service.
- Do not run destructive migrations or delete user data.
- Do not change production environment variables or deploy to production.
- Do not merge any phase without explicit user approval.
- Test using non-sensitive sample accounts and sample content.
