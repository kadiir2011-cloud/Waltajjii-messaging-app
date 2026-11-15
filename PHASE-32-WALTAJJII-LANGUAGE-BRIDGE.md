# Phase 32 — Waltajjii Language Bridge

## Purpose
Introduce a privacy-conscious translation workflow inside direct messaging, with a provider-backed server endpoint that can be enabled later by adding a secret environment variable. The feature is designed for communication across Ethiopian language communities.

## Included
- A Language Bridge panel beside the direct-message composer.
- Source language selection (including auto-detect) and target language selection for Afaan Oromo, Amharic, English, Tigrinya, Somali, Afar, and Arabic.
- Translation preview before use; the original message is not changed.
- A deliberate “Use in message composer” action. Translation never sends a message automatically.
- Authenticated server endpoint with input validation, a per-minute request limit, timeout handling, and no translation text in server logs.
- OpenAI API credentials are read only from the server environment; they are never sent to the browser.
- Clear setup guidance when the service is not configured.

## Enable live translation on the test service
Add the following environment variable in the isolated Render test service:
- `OPENAI_API_KEY`: the user's OpenAI API key, stored as a secret environment variable.

Optional:
- `OPENAI_TRANSLATION_MODEL`: defaults to `gpt-4o-mini`.

Do not place API keys in source code, GitHub files, browser storage, or chat messages. Do not add a key until the owner has obtained one and understands that API usage may incur separate charges.

## Supported in this phase
- Text translation preview and copy/use-in-composer workflow.

## Not included yet
- Voice transcription or voice translation.
- Automatic translation of incoming messages.
- AI group summaries or AI-generated replies.
- Browser push notifications.

## Validation required
- Deploy only to the isolated Render test service.
- Confirm the Language Bridge panel opens and closes.
- Confirm the UI gives a clear setup message when `OPENAI_API_KEY` is absent.
- After securely configuring a valid key, test each language pair with short non-sensitive sample text.
- Confirm translation does not send a message until the user presses Send.
- Confirm normal messaging, attachments, voice notes, groups, calls, events, and reminders still work.

This pull request is draft-only. Do not merge or deploy to production without explicit approval.
