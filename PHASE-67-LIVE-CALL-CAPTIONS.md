# Phase 67 — Live Call Captions and Translation

## Scope
Add optional, live captions during one-to-one voice and video calls, with manual translation of the latest caption. The implementation uses the browser Web Speech API; it does not stream raw call audio to a Waltajjii server.

## User experience
- The user explicitly starts and stops live captions during an active call.
- The user selects the language they are speaking: English, Amharic, Afaan Oromo, Tigrinya, Somali or Arabic.
- Captions are attributed to "You" locally or the authenticated caller's username when received.
- Sharing caption text with the other caller is a separate, unchecked opt-in. Each participant controls their own sharing.
- A user can manually translate the latest visible caption into a selected language using the existing translation API.
- Captions are cleared when the call ends; the UI retains at most 20 caption entries.

## Privacy and safety
- The UI explains that browser speech recognition may process microphone audio using the browser's speech service.
- No recording is created or saved by Waltajjii.
- Caption sharing is off by default and sends transcript text only to the authenticated active call peer.
- The server derives the sender identity from the authenticated socket, validates the active call pair, limits each caption to 500 characters and caps sharing at 20 captions per 10 seconds per socket.
- Captions and translations are not written to the database. Translation is a separate user-initiated request and remains local to the requesting device.
- No call audio, captions or translations are automatically recorded, persisted or sent as messages.

## Browser support
Live recognition requires a browser exposing `SpeechRecognition` or `webkitSpeechRecognition`. Support and language availability vary by browser, operating system and locale. A current Chrome or Edge browser is the recommended first test target. Unsupported browsers receive a clear message and can continue the call normally.

## Architecture
- Browser recognition runs only after the user starts it and checks the consent control.
- Socket event `call:caption` relays optional text only between the two users in an already authorized active call.
- The existing authenticated `/api/translation/translate` endpoint handles manual translation.
- No changes to the production SQLite runtime, call signaling protocol, media tracks or database schema.

## Verification
- Socket integration contract test checks active-call authorization, server-derived identity, 500-character validation and per-socket rate limits.
- UI contract tests check explicit consent, selected language, optional sharing, text-only rendering, call-end cleanup and manual translation.
- Full browser/device testing is still required to validate speech-recognition behavior while WebRTC is using the microphone.

## Release blockers
- Test real voice and video calls on desktop and mobile browsers; confirm microphone sharing works while WebRTC is active.
- Evaluate Afaan Oromo, Amharic and other locale accuracy with fluent speakers; browser locale support is not guaranteed.
- Review browser speech-provider processing terms and disclose them in the privacy notice before public release.
- Complete the existing PostgreSQL staging, security, monitoring and production-readiness gates.

This draft does not authorize merge, production deployment or public launch.
