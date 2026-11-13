# Phase 69 — Call Quality Monitor

## Scope
Adds a lightweight, local WebRTC call-quality panel for voice and video calls.

## User experience
- Measures connection round-trip time (RTT), inbound audio/video jitter and packet loss.
- Shows Good / Fair / Needs attention with available measurements.
- Refreshes every five seconds during an active call.
- Shows measuring or unavailable states when browser statistics are not yet available.

## Privacy and resource safeguards
- Uses the browser's existing RTCPeerConnection.getStats() API.
- Metrics remain on the user's device; no telemetry endpoint, profiling or persistence is added.
- Polling stops and its timer is cleared when the call ends.
- Does not automatically change media quality, disable video or switch networks.

## Verification
- Contract tests cover the UI disclosure, local WebRTC statistics, metrics and polling cleanup.
- JavaScript syntax and Phase 67/68 regression tests run in CI.

## Release checks
- Test voice and video calls on two physical devices and multiple network conditions.
- Confirm browser differences in getStats() reporting and tune thresholds with real call data.
- Complete full staging, privacy, security, backup/recovery and production-readiness checks.

This draft does not authorize merge, production deployment or public launch.
