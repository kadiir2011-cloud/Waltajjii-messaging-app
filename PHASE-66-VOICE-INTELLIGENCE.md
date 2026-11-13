# Phase 66 — Voice Intelligence and Transcription

## Scope
Add opt-in, user-initiated transcription of an existing voice message or a locally selected recording. The transcription endpoint is mounted only in the isolated PostgreSQL API composition.

## User experience
- A voice-message player offers a Transcribe action.
- Users can also choose an audio file (WebM, OGG, MP3, MP4/M4A, WAV or FLAC).
- A clear notice explains that the selected audio is sent to the configured AI provider.
- A separate unchecked consent control is required for each transcription.
- Users can select a spoken-language hint (Afaan Oromo, Amharic, English, Tigrinya, Somali, Arabic, or auto-detect).
- Transcript is displayed for review and can be copied or placed into the message composer; it is never automatically sent.
- Transcript can be translated with the existing authenticated multilingual translation endpoint.

## Security and privacy
- JWT authentication, four requests per ten minutes by default, 15 MB file cap, MIME allowlist, provider timeout and safe error responses.
- Audio is held in memory for the request only; this feature does not persist the uploaded audio or transcript.
- Response uses no-store and nosniff headers.
- No conversation-history scan, automatic recording, background upload, message send, or task creation.

## Architecture
- New route: POST /api/audio/transcribe.
- Uses OPENAI_API_KEY and OPENAI_TRANSCRIPTION_MODEL (default gpt-transcribe).
- Uses multipart/form-data; do not set Content-Type manually in the browser so the boundary is generated.
- Translation reuses POST /api/translation/translate.
- Route is composed only in createPostgresApiRouter, not the production SQLite server.

## Verification
Dedicated route tests cover authentication, provider call shape, in-memory upload, language and MIME validation, missing provider configuration, safe errors, and empty transcription output. UI contract tests cover consent, user initiation, no auto-send and translation workflow.

## Release blockers
- Actual controlled PostgreSQL staging E2E with provider credentials and approved spending limits.
- Real recordings across browsers and mobile devices, especially Afaan Oromo and Amharic accuracy assessment by fluent speakers.
- Cost quotas and monitoring, privacy notice and retention review.
- Complete PostgreSQL migration and security release gates.

This is a draft implementation and not a public launch approval.
