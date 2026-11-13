# Phase 68 — Live Multilingual Call Interpreter

## Scope
Builds on Phase 67 live captions by adding optional automatic translation of captions received from the other participant during an active one-to-one call.

## User experience
- Automatic translation is disabled by default and requires a separate user opt-in.
- The user selects a target language using the existing caption translation language selector.
- Only incoming captions from the authenticated active call peer are automatically translated; the user's own local captions are not.
- The translated text is shown locally beneath the caption controls and is not sent back to the caller.
- Manual translation from Phase 67 remains available independently.
- The interpreter opt-in and visible translation are cleared when the call ends.

## Privacy and cost safeguards
- The UI explains that each eligible incoming caption is sent as text to the configured translation service.
- No audio is sent by this feature; it translates only caption text already shared by the other caller.
- No captions or translations are persisted by this feature.
- The client allows at most 30 automatic translation requests per call, enforces a 1.5-second minimum interval and permits only one request in flight. Captions skipped while busy or inside the cooldown are not queued.
- A response is displayed only if automatic translation remains enabled and the same peer is still in the active call.
- The existing authenticated translation endpoint remains responsible for server-side authentication and its own rate/cost controls.

## Verification
- Contract tests verify explicit opt-in, provider disclosure, incoming-peer filtering, text-only translation, per-call caps, cooldown, single-flight behavior and stale-response protection.
- JavaScript syntax checks and Phase 67 call-caption tests run in CI.
- Real two-device testing, provider cost review, and language-quality validation remain necessary.

## Release blockers
- Test real desktop and mobile calls with both participants sharing captions.
- Validate translation quality for Afaan Oromo, Amharic, Tigrinya, Somali, Afar and Arabic with fluent speakers.
- Confirm the configured translation provider's retention, privacy and pricing terms; disclose them before public release.
- Complete PostgreSQL staging, security, monitoring, backup/recovery and full production-readiness gates.

This draft does not authorize merge, production deployment or public launch.
