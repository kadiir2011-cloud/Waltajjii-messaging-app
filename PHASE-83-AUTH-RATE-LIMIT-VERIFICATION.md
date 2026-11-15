# Phase 83 — authentication rate-limit verification

## Purpose
Strengthen automated regression coverage for the Phase 82 login and registration abuse controls without changing runtime behavior.

## Verified behavior
- Successful login responses are excluded from the failed-login counter.
- Five unsuccessful login attempts are allowed in a 15-minute window; the next unsuccessful attempt is rate-limited.
- Registration has an independent allowance of ten attempts per IP in a 15-minute window.
- Both policies retain the configured standard rate-limit headers and disable legacy headers.

## Scope and boundaries
- Test-only phase: no production route, database, Supabase, Render, or application behavior is changed.
- The Phase 82 in-memory per-process limitation remains: counters reset on restart and are not shared across multiple instances.
- These tests use a local ephemeral HTTP server and do not contact external services.

## Validation
Run:
`node --test test/phase83-auth-rate-limit-verification.test.js`
