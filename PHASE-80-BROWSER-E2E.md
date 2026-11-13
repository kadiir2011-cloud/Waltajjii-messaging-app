# Phase 80 — browser end-to-end CI

## Objective
Exercise Waltajjii's existing browser user flows in a real headless Chromium browser, complementing the API/database contract tests.

## Delivered
- Dedicated GitHub Actions job on Ubuntu 24.04 with Node.js 22.
- Install the application's locked dependencies and a pinned Playwright runner.
- Install Chromium and its required operating-system dependencies.
- Run the existing desktop login/profile/direct-message browser flow.
- Run the existing mobile registration and validation browser flow.

## Test boundary
The current browser suite uses a static copy of the frontend and mocked API/socket responses. It verifies browser rendering, interaction, responsive viewport behavior, and frontend request contracts. It does not prove that a real backend persists messages, that two real accounts exchange messages, or that calls, camera, microphone, screen sharing, TURN traversal, and push notifications work across physical devices.

## Safety
This workflow runs in GitHub Actions only. It does not deploy to Render, connect to Supabase, use production user data, or modify live services. Passing this suite is not public-launch approval.
