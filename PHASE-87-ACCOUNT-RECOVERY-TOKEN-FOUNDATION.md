# Phase 87 — account recovery token foundation

## Goal
Prepare safe, short-lived account-recovery token primitives without enabling a password-reset route or sending email.

## Included
- Generate 256-bit cryptographically random URL-safe tokens.
- Store and compare SHA-256 token digests rather than storing raw recovery tokens.
- Constant-time digest comparison for candidate tokens.
- A bounded one-to-thirty-minute expiry policy (default thirty minutes).
- Explicitly treat malformed expiry values as expired.
- Unit tests for entropy length, token uniqueness, digest matching, expiry, and TTL bounds.

## Not enabled in production
This phase does not create password-reset endpoints, send recovery messages, write recovery tokens to the database, or change existing account/login behavior. A later integration must:
1. Persist only the digest, user ID, expiry, and consumed-at timestamp.
2. Enforce single-use consumption in one database transaction.
3. Invalidate prior outstanding tokens when issuing a new one.
4. Rate-limit issuance and verification independently and avoid account-enumeration responses.
5. Deliver links through a verified email provider using server-side secrets and HTTPS.
6. Revoke active sessions after a successful password reset and notify the account owner.
7. Test concurrency, expiry, replay, database failures, and delivery failures.

## Validation
`node --test test/phase87-account-recovery-tokens.test.js`

## Safety
No production route, middleware, database schema, environment variable, email provider, Supabase project, Render service, or live-app behavior is changed. Draft PR only; no merge or deployment.
