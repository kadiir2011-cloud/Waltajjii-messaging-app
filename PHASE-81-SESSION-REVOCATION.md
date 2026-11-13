# Phase 81 — account session revocation

## Objective
Give account owners a server-enforced way to invalidate previously issued login tokens after a password change or a global sign-out.

## Delivered
- Add a backwards-compatible `token_version` column to existing SQLite user databases (default `0`).
- Add a shared signed-token verifier that checks issuer, audience, account existence, and the token version stored for that account.
- Apply the verifier to authenticated REST routes, presence/translation endpoints, and Socket.IO connection authentication.
- Add `POST /api/auth/change-password`: requires the current password, validates the new password (12–128 characters), hashes it with bcrypt, increments the account token version, and returns a fresh token for the current browser.
- Add `POST /api/auth/logout-all`: increments the account token version and invalidates all currently issued tokens, including the caller's token.
- Keep legacy tokens without a version working only for accounts whose token version remains zero; this avoids forcing all existing users to sign in again on first upgrade.

## API use
Both endpoints require `Authorization: Bearer <token>`.
- Change password JSON: `{"currentPassword":"…","newPassword":"…"}`. Replace the browser's stored access token with the returned `token`.
- Global sign-out: send an authenticated POST to `/api/auth/logout-all`; clear the local token and sign in again when needed.

## Limitations and migration notes
- Global sign-out revokes all sessions for the account, not one selected device.
- A password change invalidates other devices and returns a replacement token only to the requesting client.
- This branch's live runtime still uses SQLite. The token-version check must be carried into the eventual PostgreSQL auth/session implementation before any database cutover.
- No password-reset-by-email, MFA, trusted-device list, session inventory, or per-device logout is included.
- This is not an encryption-at-rest or end-to-end-encryption change.

## Safety
This is a draft GitHub PR only. No merge, Render deployment, Supabase connection, production database migration, or live-service change is performed.
