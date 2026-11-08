# Phase 28 — Full-name profiles and privacy-first identity

## Goals
- Preserve username/password authentication and existing account identifiers.
- Add an editable full name without forcing existing members to recreate accounts.
- Show profile photo, full name, and optional professional title/institution as the default profile identity.
- Keep username and secondary details behind an explicit “View profile details” disclosure.
- Allow each member to select a profile-card background.

## Implementation
- Additive SQLite migrations add `full_name` and `profile_background`; existing accounts retain all data and receive safe defaults.
- Authenticated profile GET/PATCH reads and updates full name and one of six approved background themes.
- Profile editor is collapsed by default; full name and background are editable there.
- Profile identity uses the full name; username and bio are shown only after opening account details.
- Social discovery, follower cards, connection requests, posts, comments, notifications, and Moments use full name as the visible identity where available.
- Social member cards provide an explicit details disclosure for username and secondary profile information.
- Existing username remains available to login and messaging workflows.

## Background choices
`mist`, `ocean`, `lavender`, `sunset`, `forest`, `slate`.

## Compatibility and safety
- No user rows are deleted or recreated.
- Login endpoints and JWT claims are unchanged.
- Full name is optional; accounts without one display “Waltajjii member” until updated.
- Profile fields remain subject to existing profile display preferences.
- No production deployment or merge is included in this phase.

## Test checklist
- Existing user can log in with the same username and password.
- Existing user can save a full name and reload it.
- Username is hidden until account/profile details are expanded.
- Each background selection previews and persists after reload.
- Social cards, posts, comments, connection requests, notifications, and Moments show full name rather than username.
- Missing full names do not break older accounts.
