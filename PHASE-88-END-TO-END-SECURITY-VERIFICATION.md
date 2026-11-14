# Phase 88 — end-to-end security verification

## Goal
Verify the existing security boundaries across login-issued JWTs, authenticated HTTP profile access, Socket.IO connection authentication, shared session claims, and browser-origin policy.

## Included
- An HTTP login-to-profile test using a real signed JWT and an injected authentication service.
- Reuse of that exact login-issued token in the Socket.IO authentication middleware.
- Rejection checks for missing, malformed, tampered, expired, wrong-issuer, and wrong-audience tokens.
- Session-claim policy checks and cross-origin allow/deny tests.
- Static assertions that the live SQLite server continues to enforce signed JWT verification, issuer/audience, Socket.IO handshake authentication, origin checks, and Helmet.

## Scope and limitations
- This phase adds verification tests only; it does not wire session revocation, account-recovery routes, token rotation, or distributed session storage.
- The HTTP integration harness uses the opt-in PostgreSQL auth router with an injected test service; it does not connect to a real database or alter production.
- The Socket.IO test invokes the existing PostgreSQL realtime authentication middleware with an in-memory harness.
- Static assertions confirm that the live SQLite server source contains its security checks; they are not a live Render penetration test.
- Phase 86 claim validation remains a separate helper and is not yet a replacement for cryptographic JWT signature verification.

## Validation
`node --test test/phase88-end-to-end-security-verification.test.js`
`node --test test/phase44-postgres-realtime-socket.test.js`
`node --test test/phase63-final-security-audit.test.js`

## Safety
No production runtime source, routes, database schema, environment variable, Supabase project, Render service, or live-app behavior is changed. Draft PR only; no merge or deployment.
