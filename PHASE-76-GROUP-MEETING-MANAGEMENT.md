# Phase 76 — Advanced Group Meeting Management

## Delivered
- Participants can raise and lower their hand during an active group call; the state is broadcast to call participants and reflected in the roster.
- The call host and current group administrators can moderate other participants.
- Moderators can lower a raised hand, request that a participant mute, or remove a participant from the active call.
- Removal clears the participant from the active-call roster, frees their call slot, removes their active-call mapping, and notifies all of that participant's connected sessions.
- A mute action is deliberately a request: the participant receives a confirmation prompt and controls their own microphone. The server does not and cannot silently disable a remote browser's microphone track.
- Host cannot be removed by another moderator. Moderation actions require the actor to be a current participant and, for non-hosts, a current group admin.

## Security and privacy
- Every moderation request is checked server-side against the active call and current group membership/role.
- Non-members, non-participants, self-targeting, invalid actions, and attempts to remove the host are rejected.
- No audio/video is recorded, uploaded, or stored by these features.
- Hand-raise state exists only in the active in-memory call and is cleared with the call.

## Limitations and testing
- Host/admin permissions are not persisted as meeting-specific co-host roles.
- Mute is voluntary and can be declined; this is intentional browser privacy behavior.
- Removal is not a ban from the group and the member may rejoin while the call is active.
- Automated contract tests do not replace multi-device testing with real browsers and cameras/microphones.
- Draft review only. No merge, deployment, production database change, or public launch is authorized.
