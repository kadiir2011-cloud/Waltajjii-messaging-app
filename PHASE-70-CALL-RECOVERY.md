# Phase 70 — Resilient Call Recovery

## Scope
Adds an explicit, user-controlled WebRTC ICE restart flow for temporary network interruptions during an active one-to-one call.

## Behavior
- The reconnect control becomes available when the peer connection enters disconnected or failed state.
- The participant requests recovery; the other participant's connected client coordinates a fresh ICE-restart offer.
- Recovery offers and answers are relayed only between the two authenticated users already paired in the active call.
- ICE candidates arriving during renegotiation are buffered until the updated remote description is applied.
- The reconnect control is disabled again after the connection recovers or the call ends.

## Safety and limitations
- This is not automatic call redial and does not bypass the normal call invitation/acceptance flow.
- It works only while both users remain connected to Waltajjii's signaling service and the server still recognizes the active call.
- A complete signaling disconnect ends the tracked call; the users must start a new call.
- ICE restart cannot guarantee recovery on restrictive networks or when TURN connectivity is unavailable.
- No audio/video is recorded, uploaded for diagnostics, or persisted by this feature.

## Verification
- Contract tests cover UI, ICE restart, active-call peer authorization, candidate buffering and cleanup.
- CI runs JavaScript syntax checks and Phase 67–69 regression tests.
- Real two-device tests under Wi-Fi/mobile-network changes remain required.

This draft does not authorize merge, production deployment or public launch.
