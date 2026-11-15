# Phase 63 — Final API and browser security audit

## Changes applied on this isolated branch

1. **Cross-origin policy:** replaced unrestricted Express `cors()` with an explicit origin policy. Production allowlist inputs are `CLIENT_URL`, `PUBLIC_APP_URL`, `RENDER_EXTERNAL_URL`, and comma-separated `WALTAJJII_ALLOWED_ORIGINS`. Same-host requests and clients without an Origin header remain supported. Localhost origins are added only outside production. Credentials are not enabled; the app uses bearer tokens.
2. **Socket.IO origin gate:** uses the same origin policy for connection admission and the configured allowlist for CORS polling requests.
3. **Deleted media access:** direct-message attachment lookup now requires `deleted_at IS NULL`; group downloads already required a live message and active membership.
4. **Private media response headers:** authenticated media/profile-picture responses now use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
5. **Browser injection check:** regression test asserts the shipped frontend does not use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `new Function` sinks.
6. **Regression coverage:** tests validate explicit allowlists, same-host requests, malformed origin rejection, local development behavior, server and Socket.IO wiring, deleted-media denial contract, media headers, CSP, and the existing desktop/mobile browser smoke tests.

## Environment configuration before deployment

Set `CLIENT_URL` to the exact public web origin. If the application uses more than one trusted web client, list the additional exact origins in `WALTAJJII_ALLOWED_ORIGINS`, comma-separated. Do not include paths, wildcards, or untrusted preview domains. Render's `RENDER_EXTERNAL_URL` is also included automatically when present. `PUBLIC_APP_URL` may be set to the canonical app origin.

## What this audit does not certify

- It does not constitute an independent penetration test, external vulnerability scan, or formal security certification.
- It does not migrate the currently deployed SQLite runtime to PostgreSQL. The PostgreSQL API stack remains opt-in and is not mounted in `src/server.js`.
- It does not attach persistent storage to Render, provision production PostgreSQL, or reconcile live Supabase Storage objects.
- It does not configure production monitoring, abuse response, backups, recovery drills, or multi-instance Socket.IO/Redis.
- It does not merge or deploy this branch.

## Public-launch decision

**Not approved for public launch yet.** The currently deployed Render service remains the SQLite application on the Free plan without a persistent disk. Its database and local uploads are not durable across service replacement/redeploy. The PostgreSQL implementation and migration rehearsal are still on an unmerged draft branch. A controlled staging cutover, durable database/media setup, backup/restore rehearsal, production environment configuration, final end-to-end tests, and rollback rehearsal are mandatory before opening registration to the public.
