# Phase 84 — proxy IP rate-limit verification

## Purpose
Verify the client-IP behavior on which the Phase 82 authentication rate limits depend when Waltajjii runs behind one trusted reverse proxy.

## Verified behavior
- With Express configured to trust exactly one proxy hop, the right-most address in a forwarded chain is used as the client address.
- Changes to an untrusted left-most forwarded value do not create a new rate-limit bucket when the right-most client address is unchanged.
- A different client address receives an independent login allowance.
- Requests without a forwarded address fall back to the direct peer address.

## Deployment requirements and limits
- This is a test-only phase; it does not change runtime application code or the existing `app.set("trust proxy", 1)` setting.
- The one-hop trust model is safe only when the hosting ingress is the sole trusted hop and overwrites or correctly appends the forwarding header. Direct public access to the Node process, an unexpected proxy chain, or an ingress that preserves attacker-supplied forwarding values can undermine IP-based limits.
- Confirm the actual Render ingress forwarding behavior and network exposure before changing trust-proxy settings.
- These tests do not establish that Render's production ingress sanitizes forwarding headers.
- Phase 82's in-memory, per-process counters remain local to each process and are not shared across instances.

## Validation
Run:
`node --test test/phase84-proxy-ip-rate-limit-verification.test.js`

## Safety
- Test-only; no production routes, runtime configuration, database, Supabase, Render, or live-app behavior is changed.
- Uses a local ephemeral HTTP server and does not contact external services.
- Draft review only; no merge or deployment is authorized.
