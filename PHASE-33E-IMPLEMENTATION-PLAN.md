# Phase 33E — Audit Findings and Safe Migration Plan

This plan accompanies `PHASE-33E-APPLICATION-POSTGRESQL-COMPATIBILITY-AUDIT.md`.

## Scope of this phase
- Read-only review of the current SQLite runtime, authentication/profile routes, Socket.IO persistence, and background reminder worker.
- Record behavior that the PostgreSQL implementation must preserve.
- Identify SQL dialect and data-type incompatibilities.
- Define gates for safe later integration.

## Explicitly out of scope
- No runtime code changes.
- No database connection or credential handling.
- No Supabase SQL execution or schema changes.
- No Render environment changes or deployment.
- No production merge.

## Exit criteria
- Audit findings documented and linked to the Phase 33C adapter foundation.
- High-risk SQLite-only call sites identified.
- Follow-on migration sequence and release gates documented.
- Draft PR available for review.

## Next implementation phase (after audit review)
Start with an isolated PostgreSQL test harness and an application composition boundary. Preserve the existing SQLite application entrypoint. Add a separate PostgreSQL test entrypoint that can be exercised with mocks first and a disposable PostgreSQL database later. Only then migrate authentication/profile and Socket.IO persistence. Do not make the PostgreSQL entrypoint the default until end-to-end parity is demonstrated.

## Required test coverage before any runtime switch
- Registration: valid, invalid, duplicate username, database failure.
- Login: correct/incorrect password, case-insensitive username behavior, missing JWT secret.
- Profile: get/update, invalid background/mode, field length limits, nonexistent account.
- Presence: self-exclusion, multiple sessions, disconnected users.
- Socket.IO: group room join, membership authorization, typing, message delivered/read receipts.
- Messages/groups/channels/social/moments/uploads: authorization, transaction rollback, uniqueness and not-found cases.
- Reminders: due-window calculation, atomic deduplication across concurrent workers.
- Restart: persisted users, messages, profiles and group data survive process restart.
