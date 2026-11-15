# Phase 72 — Secure One-to-One Call Screen Sharing

## Scope
Adds user-initiated screen sharing to an established one-to-one video call.

## Behavior
- Screen sharing is available only after a video call reaches the connected state.
- The browser's native display-capture permission chooser is used; the user selects what to share.
- The display video track replaces the outgoing camera video track using RTCRtpSender.replaceTrack(), avoiding a new signaling offer.
- Microphone audio is not captured or replaced by this feature.
- The local preview is shown on the sharing device. The remote participant receives the screen through the existing peer-to-peer video stream.
- The user can stop sharing from Waltajjii or from the browser's native sharing controls. Stopping restores the camera track when it is still available.
- Ending the call stops all display-capture tracks and clears the local preview.

## Privacy and security
- Screen sharing is off until the user explicitly presses Share screen and grants browser permission.
- The browser controls the capture source and displays its native sharing indicator.
- Screen pixels are transmitted through the existing WebRTC peer connection to the active call participant; this feature adds no server-side recording, upload, storage, or analytics.
- The feature does not request display audio.
- Sharing is unavailable in browsers or contexts without getDisplayMedia support; HTTPS and browser permission are required.

## Verification
- Contract tests cover explicit opt-in, video-only replacement, camera restoration, browser stop, and call teardown.
- CI runs syntax checks and the Phase 69–71 call regression tests.

## Release checks
- Test with two physical devices and supported desktop browsers.
- Verify remote screen rendering, camera restoration, native browser stop controls, and call termination.
- Confirm browser-specific behavior and accessibility before public release.

Draft review only. No merge, production deployment or public launch is authorized.
