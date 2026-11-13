# Phase 77 — Ethiopian language expansion for caption translation

## Delivered
- Expanded the “Translate latest caption into” selector to include Afaan Oromo, Amharic, Tigrinya, Somali, Afar, Sidama, Wolaytta, Gamo, Gofa, Dawro, Hadiyya, Kafa, Gedeo, Kambaata, Silt'e, Sebat Bet Gurage, Bench, Shekkacho, Gumuz, Nuer, Anuak, Berta, Me'en and Konso, in addition to English and Arabic.
- Applied the same expanded language choices to the message translator, AI answer language, and transcript translation selectors.
- Expanded the authenticated translation API allowlist so the newly selectable languages are accepted by the server.
- Updated translation guidance to favor each requested language and its writing system rather than silently substituting a more widely spoken language.

## Privacy and safety
- Existing consent and opt-in behavior remains unchanged.
- Caption translation remains a separate user action; automatic incoming-caption translation remains off by default.
- Translation text is sent to the configured translation provider; output is displayed locally and not broadcast to the caller.
- API responses remain marked no-store.

## Important limitations
- This expands the languages Waltajjii can request from its configured AI translation provider; it does not guarantee equal fluency or availability for every language or dialect.
- The translation provider must be configured with OPENAI_API_KEY in the target service. No provider key was added or changed in this phase.
- Browser speech-recognition language availability is controlled by the browser/device and is not changed by this translation-language expansion.
- Important medical, legal, financial, or official communications should be reviewed by a fluent speaker before use.
- Test with native/fluent speakers for each language before public launch.

## Verification
- Automated tests verify the UI choices and server allowlist stay aligned.
- Real provider-based translation quality checks are still required.

Draft review only. No merge, deployment, production database change, or public launch is authorized.
