# Phase 78 — regression hardening and release gate

## Objective
Strengthen automated regression protection across the existing Waltajjii feature set before beginning production infrastructure changes.

## Delivered in this phase
- Add cross-feature contract checks for mounted API modules, HTTP security boundaries, authenticated Socket.IO handshakes, translation privacy, and critical call/language controls.
- Add a dedicated GitHub Actions workflow that syntax-checks JavaScript under `src`, `public`, and `test`.
- Run the current feature regression tests and isolated PostgreSQL adapter/auth/realtime unit tests together on pull requests.
- Document the limits of automated checks and the real-device acceptance tests still required before public launch.

## Why some integration suites are separate
The repository also contains tests that intentionally require a disposable PostgreSQL service, a populated SQLite fixture/native SQLite build, or a browser automation environment. They are not run by this isolated release-gate job because those dependencies have not yet been provisioned in this workflow. They must be enabled in dedicated database/browser CI jobs before production launch; their exclusion is not a pass result.

## What automated tests do not prove
- Real two-account message delivery, persistence after restart, or attachment retrieval.
- Camera/microphone permissions, screen sharing, ICE/TURN traversal, or multi-device group-call stability.
- Translation quality or browser speech-recognition availability for each language.
- Production database, storage, backup, and recovery readiness.

## Required manual acceptance before public launch
1. Test two independent accounts on separate devices and networks.
2. Verify direct messages, replies, reactions, attachments, group membership, and channel access.
3. Test one-to-one and group calls, mute/camera controls, screen sharing, participant moderation, and reconnection.
4. Test the language selectors and provider configuration; validate important languages with fluent speakers.
5. Confirm data survives service restart only after durable database and storage are configured.

## Safety boundary
This phase changes source code and CI only. It does not merge any pull request, deploy to Render, modify Supabase, migrate production data, or authorize public launch.
