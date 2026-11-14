# Phase 85 — distributed authentication rate-limit store

## Goal
Provide an optional shared Redis-compatible store for express-rate-limit v7 so separate Waltajjii processes can use the same authentication-attempt counters.

## Included
- A dependency-free Fetch-based Redis REST adapter compatible with Redis REST services that accept JSON command arrays and EVAL.
- Atomic INCR + first-hit PEXPIRE + PTTL in one Lua script.
- Namespaced keys, decrement/reset support, and explicit errors for missing configuration, network failures, and malformed responses.
- Unit tests using a mocked Fetch implementation; tests do not contact a real Redis service.

## Not yet enabled in production
This phase deliberately does not change authentication middleware wiring, runtime environment variables, Render, Supabase, or the live app. The adapter is an opt-in building block, not proof of a configured shared store.

Before enabling it:
1. Provision a managed Redis-compatible service (for example, a Redis REST provider) and keep its URL/token in server-side secrets only.
2. Confirm the provider supports EVAL/Lua and the command response format used here.
3. Wire the store separately into both registration and login limiters, with `passOnStoreError: false` so store outages do not silently fall back to unshared memory.
4. Set bounded connection/request timeouts and define operational behavior for provider outages.
5. Verify counters across two independent app processes and test expiry, reset, and provider failure.
6. Confirm provider pricing, region, data retention, TLS, and secret rotation before production use.

## Important limitations
- Existing Phase 82/83/84 rate limiters remain in-memory until a later reviewed integration phase.
- This adapter's mocked unit tests do not verify a real provider, cross-process behavior, or production network reliability.
- Redis REST providers differ; validate EVAL support and response shape against the selected provider before wiring it.
- IP-based limits remain dependent on the trusted-proxy configuration verified separately in Phase 84.

## Validation
`node --test test/phase85-distributed-rate-limit-store.test.js`

## Safety
No production route, middleware wiring, environment variable, database, Supabase, Render service, or live-app behavior is changed by this phase.
