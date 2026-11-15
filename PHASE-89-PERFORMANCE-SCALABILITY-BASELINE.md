# Phase 89 — performance and scalability baseline

## Goal
Establish a repeatable, low-risk CI baseline for authentication HTTP throughput and Socket.IO JWT handshake concurrency.

## Included
- 120 concurrent authenticated profile requests, executed in batches of 24.
- Per-request latency measurements with p50 and p95 output.
- Per-user identity assertions to detect cross-request identity leakage.
- A 200-connection concurrent Socket.IO JWT verification burst.
- Generous five-second ceilings intended to catch hangs or severe regressions, not to claim production capacity.

## Important limitations
- Uses an in-memory injected authentication service and local ephemeral HTTP server.
- Does not benchmark PostgreSQL query latency, Redis, media uploads, message fan-out, browser rendering, or Render instance limits.
- Does not generate traffic against the public Render app or any external service.
- CI timings are a regression signal only; they are not a production SLA or capacity estimate.
- A production capacity study requires a separately approved staging environment, realistic datasets, monitoring, and a controlled ramp-up load plan.

## Validation
`node --test test/phase89-performance-scalability.test.js`

## Safety
No production runtime code, database schema, environment variable, Supabase project, Render service, or live-app behavior is changed. Draft PR only; no merge or deployment.
