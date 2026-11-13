# Phase 64 — Waltajjii AI Assistant Foundation

## Status

First implementation slice on an isolated draft branch. Backend-only API foundation; not merged, not deployed, and not mounted by the production SQLite server. No Supabase schema or live data was changed.

## Read-only review findings

- The latest reviewed code base is Phase 63 security audit commit `e50d737e9f6e8a16772785678ab682e6f1e5b7ab`.
- Existing PostgreSQL modules already cover auth/profile, direct and group messaging, channels, social/feed, Moments, presence, uploads/media, calls, translation, group governance and event reminders.
- A translation route already uses the OpenAI Responses API and supports Afaan Oromo, Amharic, English, Tigrinya, Somali, Afar and Arabic. It is an opt-in PostgreSQL API module, not evidence of a production PostgreSQL cutover.
- Low-bandwidth preferences and the Language Bridge are existing product groundwork. Voice transcription, conversation summaries, suggested replies and task extraction are not implemented in this reviewed branch.
- The PostgreSQL migration design defines 29 application tables in the isolated `waltajjii` schema. The connected Supabase project `xprqnfhoxwbhrafuqvqc` currently has five legacy application tables in `public` and no `waltajjii` schema. The second connected project `samwfktbrrbshhfhttsy` has no application tables in its user schemas. These projects must not be assumed to be staging databases ready for migration.

## Scope of this first slice

Adds an authenticated, rate-limited, stateless AI endpoint with three user-invoked actions:

- `summarize`
- `suggest_reply`
- `extract_tasks`

The user supplies the exact context to process in the request. The endpoint does not query message history, read other account data, persist prompts or responses, send messages, create tasks, or schedule reminders. The user remains in control of any follow-up action.

## API contract

`POST /api/ai/assist`

Request JSON:

```json
{
  "action": "summarize",
  "context": "User-selected conversation text",
  "outputLanguage": "English"
}
```

- `action`: one of the three supported actions.
- `context`: 1–8,000 characters, selected and submitted by the authenticated user.
- `outputLanguage`: optional; one of the seven supported Waltajjii languages.
- Success: `{ "action": "...", "result": "...", "outputLanguage": "..." }`.
- Missing provider configuration: HTTP 503.
- Anonymous or invalid session: HTTP 401.
- Invalid input: HTTP 400.
- Provider failures: generic HTTP 502/504; provider secrets and raw diagnostics are not returned.

## Privacy and safety

1. AI processing is explicit and user-initiated; no background scanning of conversations.
2. Only the selected text is sent to the configured provider. The route has no database dependency.
3. Context is treated as untrusted quoted data; instructions embedded in messages must not override the assistant's task.
4. No prompt or response content is written to application logs or database by this endpoint.
5. The endpoint never sends a message or creates a task. Later UI work must require a separate user confirmation for any action.
6. The API key remains server-side in `OPENAI_API_KEY`; the model can be configured with `OPENAI_ASSISTANT_MODEL`.
7. Requests are rate-limited to six per minute per client IP and context is capped at 8,000 characters. This is not a complete monetary spending cap; provider-side budget alerts/limits and per-user usage metering are required before broad enablement.
8. The endpoint is mounted only in the opt-in PostgreSQL API composition. Production `src/server.js` remains SQLite-backed and is not changed.

## Database impact

None in this slice. AI requests and results are not persisted, so no new migration is proposed. A future usage-metering feature must store minimal metadata only (user ID, action, timestamp, model, token/cost usage), never raw conversation text by default, and must be reviewed for retention and deletion rules.

## Not included yet

- Frontend assistant panel or message selection UI.
- Automatic conversation retrieval.
- Voice transcription or speech generation.
- Persistent AI chat history.
- Durable tasks/reminders creation.
- Monthly per-user quotas and administrator usage dashboard.
- Independent privacy/security assessment and language quality evaluation.

## Verification

The Phase 64 test covers authentication, the three actions, input validation, output-language validation, provider-not-configured behavior, generic provider failures, empty provider output, and prompt-injection boundaries. The existing PostgreSQL API composition test confirms the route is mounted only in the injected test/staging composition.

## Required next steps

1. Review and approve this backend API contract.
2. Add a user-facing assistant panel that requires explicit message/context selection and clearly displays that text will be sent to the AI provider.
3. Add user confirmation before copying a suggested reply into the composer; sending remains a separate user action.
4. Add provider-side budget alerts, usage accounting and a per-user quota before public enablement.
5. Conduct human-reviewed Afaan Oromo and Amharic quality testing.
6. Integrate and test only in a controlled staging environment after the PostgreSQL migration/cutover gates are approved.

## Safety boundary

No live Supabase SQL, schema changes, Render environment changes, merge, or deployment are part of Phase 64. Keep this pull request in draft until reviewed.
