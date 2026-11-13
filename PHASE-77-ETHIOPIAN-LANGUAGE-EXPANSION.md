# Phase 77 — Ethiopian and international language expansion

## Delivered
- Expanded “Translate latest caption into” and all other translation language selectors to 118 languages.
- Coverage includes 24 Ethiopian languages and 94 additional languages used internationally across Africa, Europe, Asia, the Middle East and the Americas.
- Extended the authenticated translation API allowlist to match the user interface.
- Added language categories to make the long lists easier to browse.
- Updated translation guidance to use the requested language and writing system without silently substituting another language.

## Privacy and safety
- Existing consent and opt-in behavior remains unchanged.
- Caption translation remains a separate user action; automatic incoming-caption translation remains off by default.
- Caption text is sent to the configured translation provider; output is displayed locally and not broadcast to the caller.
- API responses remain marked no-store.

## Limitations
- Listing a language means Waltajjii can request that language from its configured AI translation provider; it does not guarantee equal quality, dialect coverage, or provider support for every language.
- Provider configuration requires OPENAI_API_KEY in the target service. No secret was added or changed.
- Browser speech-recognition language availability is separate and unchanged.
- Important medical, legal, financial, or official translations should be reviewed by a fluent speaker.
- Validate with fluent speakers and native-language test cases before public launch.

Draft review only. No merge, deployment, production database change, or public launch is authorized.
