# Phase 71 — Smart Network Adaptation

## Scope
Adds local, user-controllable adaptive video quality for one-to-one video calls, using the WebRTC statistics already collected by Phase 69.

## Behavior
- Automatic adaptation is enabled by default and can be switched off in the call panel.
- Sustained poor network measurements reduce outgoing video bitrate, frame rate and resolution.
- Fair conditions select a balanced profile; sustained good conditions restore standard video quality.
- Hysteresis requires repeated samples before changing profiles to avoid reacting to one noisy measurement.
- Voice-only calls are not modified.
- Disabling adaptation restores standard video sender settings.

## Privacy and safeguards
- Uses local RTCPeerConnection statistics and RTCRtpSender parameters only.
- No network-quality telemetry, server endpoint, profiling or persistence is added.
- The feature does not change ICE servers, network routes, microphone settings or call signaling.
- If browser sender-parameter adjustment is unsupported, the call continues with its existing media settings and the UI reports that adaptation is unavailable.
- Video quality is limited to conservative profiles; this does not guarantee recovery on a poor network.

## Verification
- Contract tests cover user control, video-only sender changes, hysteresis, restore behavior and cleanup.
- CI runs JavaScript syntax checks and Phase 69–70 call regression tests.

## Release checks
- Verify on two physical devices with varying Wi-Fi and mobile data conditions.
- Check supported browser differences in RTCRtpSender.setParameters().
- Confirm visual quality, audio continuity, battery use and data consumption before release.
- Complete full staging, privacy, security, backup/recovery and production-readiness checks.

This draft does not authorize merge, production deployment or public launch.
