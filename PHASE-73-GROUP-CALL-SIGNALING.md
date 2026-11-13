# Phase 73 — Secure Group Video Conference Signaling Foundation

## Scope
Adds authenticated Socket.IO signaling primitives for group calls. This is the server-side foundation for a later multi-peer browser media interface; it does not yet add a user-facing group video-call screen.

## Supported signaling lifecycle
- A current member of a group can start one active conference for that group.
- Other current group members can join the active conference.
- The conference is limited to eight participants, including the host.
- The server relays WebRTC session descriptions and ICE candidates only between two authenticated users who are both participants in the same active group call.
- A participant can leave. The host can end the conference for everyone.
- Disconnect cleanup removes participants and ends the call when the host disconnects or the room becomes empty.
- One-to-one and group calls cannot overlap for the same user.

## Security and privacy
- Every signaling event is received over the existing authenticated Socket.IO connection.
- Group membership is checked against the current group_members table when starting or joining.
- Signaling payloads are relayed only to the intended participant's authenticated user room.
- No media is routed through or recorded by the server; this layer only relays WebRTC signaling.
- Active conference state is in memory and is lost on server restart. This is intentional for the initial signaling foundation.

## Explicit limitations
- No group-call user interface or multi-peer RTCPeerConnection mesh is included in this phase.
- No TURN/SFU capacity, bandwidth adaptation across multiple peers, recording, or call history is introduced.
- The eight-person limit is a conservative mesh-signaling guard, not a guarantee of acceptable media quality on all devices/networks.
- Real multi-device security and interoperability tests are required before public release.

## Verification
- Automated contract tests cover membership authorization, participant limits, peer-only signaling, host-only termination, and disconnect cleanup.
- Syntax and existing call regression tests run in CI.

Draft review only. No merge, production deployment, or public launch is authorized.
