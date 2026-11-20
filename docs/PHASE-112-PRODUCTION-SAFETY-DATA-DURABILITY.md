# Phase 112 — Production safety and data durability audit

## Purpose

Establish a safe, evidence-based path to improve Waltajjii production durability without risking existing accounts, messages, media, or the current live service.

This phase is an audit and release-gate document. It does **not** switch the production database, change Render environment variables, modify Supabase resources, run migrations, or claim that a backup has been created.

## Current production boundary

- Production service: `Waltajjii-messaging-app-1`
- Render service ID: `srv-dblodu9srm7s73f8l4m0`
- Production URL: https://waltajjii-messaging-app-1.onrender.com
- Runtime command currently configured: `node src/server.js`
- Render plan reported by the service configuration: Free
- The live deployment branch is `waltajjii-phase111-restore-teal-workspace`.

The service configuration reports no persistent disk. The production runtime has previously been identified as using SQLite. Therefore, local filesystem/database durability must be treated as a production risk until verified otherwise. A successful deploy or healthy HTTP response is not proof that user data is backed up or durable.

## Non-negotiable safety rules

1. Do not change the live service's database engine or connection string in this phase.
2. Do not run schema migrations against production.
3. Do not delete, truncate, overwrite, or reinitialize any production database or storage bucket.
4. Do not expose database URLs, service-role keys, JWT secrets, backup contents, or user data in logs, issues, or CI artifacts.
5. Do not claim a backup exists until an actual backup artifact has been created, checksummed, and its restore has been rehearsed in an isolated environment.
6. Keep the current production branch and deployment available for rollback until a separately approved cutover is complete.

## Required audit work

### A. Inventory the actual runtime

Record, from repository code and Render configuration:
- the database adapter selected by the production entrypoint;
- the exact SQLite database path, if SQLite is active;
- all upload/media directories and whether they are on persistent storage;
- whether any production process writes durable state to the container filesystem;
- all required environment-variable *names* (never their values);
- health-check behavior and graceful shutdown behavior.

### B. Establish backup and restore evidence

Before a production cutover:
- create a consistent database backup using the database's supported backup mechanism;
- create a separate inventory/backup of user-owned media objects;
- record UTC timestamp, file sizes, and SHA-256 checksums;
- store backups outside the application container in access-controlled storage;
- encrypt backups at rest and restrict access;
- restore the backup into an isolated staging database;
- verify account counts, message counts, relationship integrity, and media references using aggregate or anonymized checks only;
- document measured recovery time and recovery point.

A backup that has not passed an isolated restore test is not an accepted recovery point.

### C. PostgreSQL migration readiness

The repository has prior PostgreSQL staging and shared realtime work. That does not by itself prove the production application is fully migrated.

Before cutover, demonstrate:
- schema and migration parity;
- complete application read/write coverage on PostgreSQL for accounts, profiles, contacts, conversations, messages, groups, channels, reactions, notifications, and call state;
- transaction and concurrency behavior;
- session/authentication compatibility;
- media object ownership and URL compatibility;
- two-runtime integration tests;
- migration rehearsal from a verified production-like snapshot;
- rollback rehearsal and a defined write-freeze/cutover window.

The current production SQLite runtime must remain authoritative until all gates pass.

### D. Media durability

Verify whether uploaded files currently live on ephemeral container storage or external object storage. For each media type, confirm:
- durable object key and owner association;
- private/public access policy;
- signed URL or authorized retrieval behavior;
- upload size and MIME validation;
- orphan detection and reconciliation;
- backup/export and restore procedure.

Do not change the current bucket's public/private setting as part of this audit.

### E. Operational readiness

Add or verify:
- a health endpoint that checks application readiness without exposing secrets;
- structured error logging with personal data and credentials redacted;
- monitoring for restart loops, memory pressure, database failures, and storage errors;
- graceful shutdown and in-flight request handling;
- deployment rollback instructions;
- a documented incident contact and recovery runbook.

## Acceptance gates

Phase 112 is ready for implementation review only when the following evidence is attached:

- [ ] Runtime and storage inventory reviewed against the exact production branch.
- [ ] Current database path and persistence characteristics verified.
- [ ] Media storage path and access policy verified.
- [ ] Backup artifact created outside the service container.
- [ ] Backup checksum recorded and artifact access restricted.
- [ ] Isolated restore completed successfully.
- [ ] Aggregate integrity checks passed.
- [ ] PostgreSQL application parity evidence reviewed.
- [ ] Migration and rollback rehearsals passed.
- [ ] No production data or secrets exposed in CI artifacts.
- [ ] Production service remains healthy and unchanged during the audit.

## Next implementation sequence

1. Inspect the exact production source and identify the live database and media paths.
2. Implement a read-only, secret-redacted storage inventory.
3. Create and verify a backup in an approved external destination.
4. Rehearse restore in isolated staging.
5. Close PostgreSQL parity gaps.
6. Propose a separate cutover plan for explicit review; do not auto-cut over.

## Status

**Audit guardrails documented; implementation and backup verification are not yet complete.** No production database, media bucket, Render environment variable, or user record was changed by this phase.
