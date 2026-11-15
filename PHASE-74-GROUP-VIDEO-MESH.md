# Phase 74 — Group Video Conference Interface and Multi-Peer Mesh

## Delivered
- Adds group-call start, join, and leave/end controls to the existing Groups screen.
- Shows active-call availability to current group members and supports checking status when opening a group.
- Requests camera and microphone access only after a user explicitly starts or joins.
- Establishes a browser RTCPeerConnection mesh between participants, exchanging SDP offers/answers and ICE candidates through the authenticated Phase 73 signaling layer.
- Renders a local preview and remote participant video tiles.
- Supports up to eight participants as enforced by the server.
- Closes peer connections and stops local media tracks on leave, end, or remote call termination.

## Architecture and constraints
- Media is exchanged peer-to-peer; the application server relays signaling only.
- This is a mesh topology. Each participant can have up to seven peer connections. CPU and bandwidth use increase with participant count; eight is a signaling cap, not a quality guarantee.
- TURN credentials come from the existing call-credential endpoint. Connectivity depends on the configured ICE/TURN infrastructure and network/firewall conditions.
- No SFU, server-side recording, call recording, or persistence of active call state is added.
- Group call state remains in server memory and is lost on restart.
- Existing one-to-one calling remains separate; the server rejects overlapping one-to-one and group calls for the same account.
- Screen sharing within group calls, active-speaker layout, call chat, and device switching are not included.

## Verification and release boundary
- CI checks JavaScript syntax, UI controls, peer signaling contracts, media cleanup, Phase 73 authorization, and existing call regression suites.
- Automated contract tests do not prove real camera/microphone behavior, NAT traversal, browser interoperability, or multi-device stability.
- Test with at least three independent accounts/devices and different networks before release.
- Draft review only. No merge, deployment, production database change, or public launch is authorized.
