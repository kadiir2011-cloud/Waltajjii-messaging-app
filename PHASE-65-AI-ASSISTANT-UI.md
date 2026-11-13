# Phase 65 — Waltajjii AI Assistant UI

## Status
Isolated draft branch based on Phase 64. Frontend-only integration for the stateless AI assistant endpoint. Not merged or deployed.

## User experience
- Adds a responsive Waltajjii AI panel below the direct-message composer and language bridge.
- Adds an Ask AI action to eligible text messages.
- Selecting a message fills the panel with that message body only; the user can edit or replace it.
- Offers summarize, suggested reply, and action-item extraction.
- Offers seven output languages already supported by the Phase 64 endpoint.
- Requires an unchecked, explicit consent checkbox before sending selected text to the AI provider.
- Shows results as text, with controls to copy the result or place a draft into the existing message composer.

## Safety and privacy
- Does not fetch or scan conversation history for AI.
- Does not automatically submit a message, create a task, schedule a reminder, or persist AI output.
- The Use in message composer action only fills the composer; the user must separately press Send.
- Uses the existing authenticated API helper and Phase 64 endpoint.
- Output is rendered with textContent, not HTML.
- Message content is capped at 8,000 characters for AI requests; composer output is capped at 2,000 characters.
- Users are told what will be sent and must affirm consent on each generation request.

## Compatibility boundary
The endpoint is mounted only in the opt-in PostgreSQL API composition. The current production SQLite server does not mount it. This UI must be tested only with the controlled PostgreSQL staging composition; on the current SQLite service it will report that the endpoint is unavailable. No production server route is added in this phase.

## Verification
Static UI contract tests check disclosure, consent, supported actions, selected-message context, safe text rendering, and the absence of automatic message submission. Browser smoke and responsive checks are included in CI.

## Not included
- Automatic AI history access or long-term AI chat memory.
- Voice transcription.
- Persistent prompt or response storage.
- Task creation or reminder scheduling.
- Provider usage metering, per-user quotas, or a cost dashboard.

## Release blockers
- Provider-side spending limits and monitoring plus per-user usage quotas.
- Human-reviewed Afaan Oromo and Amharic language-quality assessment.
- Staging end-to-end tests against the actual PostgreSQL API.
- Privacy notice and retention terms reviewed for the launch jurisdiction.
- Complete PostgreSQL migration and security release gates.
