# Phase 61 — group event reminder worker reliability

## What changed

- The PostgreSQL group-event reminder worker now exposes a read-only health snapshot.
- Counters include total, successful and failed runs, consecutive failures, last start/success/failure timestamps, last duration, last delivery count and bounded last-error text.
- Optional status reporting is isolated: a monitoring callback failure cannot interrupt reminder delivery.
- Concurrent calls within a process share one in-flight run. The scheduler remains idempotent when multiple processes run because reminder notifications and delivery markers are committed together in PostgreSQL.
- Integration coverage now exercises three simultaneous reminder sweeps and a subsequent no-op sweep, asserting that each group member receives only one reminder notification.
- Worker tests cover overlap, lifecycle, failure recording, recovery and configuration validation.

## Operational configuration

The worker defaults to a 30-second interval. For staging, the caller may inject a status callback that exports the snapshot to application logs or the chosen monitoring system. Do not expose internal worker state through a public unauthenticated HTTP endpoint.

The worker must be started only after the PostgreSQL pool and governance service are ready. During shutdown, call and await `stop()` before closing the PostgreSQL pool. A worker restart is safe because delivery markers are transactionally idempotent.

## Important limitation

This phase improves the worker helper and proves the service's concurrency/idempotency behavior. It does not start the worker in the current SQLite production server or change the live Render service. The worker remains part of the opt-in PostgreSQL staging/cutover path. Staging alert thresholds, deployment scheduler wiring, and production observability still require the controlled staging gate.

## Safety

- Draft PR only; no merge or deployment.
- No live Supabase DDL/data changes.
- No Render changes or restarts.
- No production runtime switch.
