# Phase 30 — Live Online Presence

## User experience
- Show a People online panel immediately after sign-in, without requiring search or refresh.
- Display other connected accounts as mini profile cards with avatar, full name, and the professional title/organization permitted by each profile's display mode.
- Exclude the signed-in account and never expose usernames in the online directory.
- Provide a Message action that opens the existing conversation.

## Technical approach
- Reuse the authenticated Socket.IO online-session map and presence snapshot/update events.
- Add an authenticated, no-store endpoint that returns only currently connected members and limited profile fields.
- Refresh the panel on initial load and every presence snapshot/update.
- No database migration; no changes to messages, calls, groups, events, or authentication behavior.

## Privacy and scope
- Full name and avatar are shown as the existing limited profile identity.
- Professional fields are returned only when profile mode is professional or both.
- Passwords, usernames, bio, department, location, website, and last-seen data are not returned by this endpoint.
- This is a test branch only; production is not changed.

## Manual verification
1. Sign in on two accounts in separate browsers/devices.
2. Confirm each sees the other in People online without refresh or search.
3. Confirm each card shows the correct name/avatar and optional professional descriptor.
4. Click Message and confirm the existing conversation opens.
5. Close one session and confirm its card disappears automatically.
6. Sign in with one account only and confirm the empty state appears.
