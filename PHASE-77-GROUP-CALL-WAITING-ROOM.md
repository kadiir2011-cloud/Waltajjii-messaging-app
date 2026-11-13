# Phase 77 — Group-call waiting room

## Delivered
- Group members request entry to an active group video call before their camera or microphone is activated.
- The active call host receives a live waiting-room request and can explicitly admit or decline each person.
- Admission is checked server-side and represented by a one-time authorization; a participant cannot bypass the waiting room by emitting the join event directly.
- Admission and denial are delivered to the requesting socket only, avoiding media prompts on other logged-in devices for the same account.
- Pending requests are cleared and the requester is notified if the call ends before a decision.
- Camera and microphone permission is requested only after the host admits the participant.

## Security and privacy
- Only current group members can request entry.
- Only the active call host can admit or decline requests; group-admin status alone does not override the host's meeting admission decision.
- Existing eight-participant limit and one-to-one call exclusion remain enforced.
- Waiting-room state is held in memory for the active call only; it is not persisted.
- No recording, media upload, or background camera/microphone activation is introduced.

## Limitations and verification
- Waiting-room requests are ephemeral and are lost if the server restarts or the call ends.
- A host must be online to receive and act on requests.
- Automated contract tests do not replace real multi-device browser testing, including simultaneous sessions and network changes.
- Existing scheduled group events, RSVP, and reminder notification features are reused; this phase does not create a duplicate scheduler.
- Draft review only. No merge, deployment, production database change, or public launch is authorized.
