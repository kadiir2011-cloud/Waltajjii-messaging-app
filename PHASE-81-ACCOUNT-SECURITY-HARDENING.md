# Phase 81 — account security hardening

## Delivered
- Add an independently tested password policy for newly registered accounts.
- Retain long passphrases without arbitrary uppercase/symbol requirements.
- Reject common weak passwords, passwords containing the username, repeated-character passwords, and obvious predictable sequences.
- Preserve existing password hashes and login compatibility; policy applies only when choosing a password during registration.
- Mark successful login responses as non-cacheable so bearer tokens are not stored by shared caches.

## Security boundary
- This does not add password reset, MFA, account recovery, server-side session revocation, or breach-corpus checking.
- Existing accounts are not forced to change their passwords.
- Existing two-hour JWT expiry remains unchanged.
- Password strength validation is a baseline, not a guarantee against account compromise.

## Validation
Run `node --test test/phase81-account-security.test.js` and the existing regression workflows.

## Safety
This phase is isolated on a draft branch. It does not deploy to Render, modify Supabase, migrate production data, or change the live app.
