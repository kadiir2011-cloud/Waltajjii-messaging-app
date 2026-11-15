# Phase 75 — Group Call Controls, Participant Roster, and Layouts

## Delivered
- Adds in-call microphone mute/unmute by enabling or disabling the local audio tracks.
- Adds camera on/off by enabling or disabling the local video tracks; tracks remain attached so toggling does not require renegotiation.
- Adds an accessible participant roster reflecting the local preview and connected remote video tiles.
- Lets each participant focus/pin a roster member and switch between grid and focus layouts.
- Controls remain disabled until the local user has joined an active group call and are reset when the call ends.
- No media is recorded, uploaded, or stored by these controls. Mute/camera state is local to the user's device and is not represented as a server-authoritative participant status.

## Constraints
- Participant roster reflects tiles established by the local browser; it is not a server-authoritative attendance list.
- Focus layout hides non-focused tiles locally only; it does not affect other participants.
- This phase does not add host removal/kick, moderator permissions, participant hand-raise, or server-side mute.
- Group calls continue to use the Phase 74 peer mesh, with its bandwidth/CPU limitations and eight-person signaling cap.

## Verification and release boundary
- Automated tests cover UI controls, local track toggles, roster rendering hooks, layout switching, and teardown.
- Real multi-device tests are still required for camera/microphone behavior and browser compatibility.
- Draft review only. No merge, deployment, production database change, or public launch is authorized.
