# Phase 29 — Next-generation profile design

## Design goals
- Upgrade the Phase 28 profile identity with polished, contemporary visual themes.
- Keep profile photo, full name, and optional professional descriptor as the visible identity.
- Preserve the privacy-first disclosure for username and other account details.
- Keep existing username/password login and all messaging/social workflows unchanged.

## New profile themes
Classic themes remain supported: mist, ocean, lavender, sunset, forest, slate.

New themes:
- Aurora glow — animated teal/blue/violet aurora gradient (respects reduced-motion preferences).
- Midnight glass — deep navy glass-inspired surface.
- Rose quartz — soft pink/lilac gradient.
- Graphite luxe — charcoal and steel gradient.
- Pearl minimal — clean pearl/ivory gradient.
- Neon dusk — deep violet/blue with magenta glow.
- Ocean glass — layered teal and ocean blue.
- Cosmic violet — violet and plum gradients.

## Implementation
- Theme choices are added to the existing profile background selector.
- Existing profile save endpoint accepts the new approved theme keys.
- Live preview continues to update when the theme selector changes.
- Theme is stored in the existing profile_background field; no new database migration is required.
- Profile hero gains layered gradient lighting, subtle glass identity panel, refined avatar border/shadow, and responsive sizing.
- Social profile cards receive matching theme styling.
- Existing six themes and old profile values remain compatible.
- Aurora animation respects prefers-reduced-motion.

## Safety and compatibility
- No user records are deleted or recreated.
- No authentication, JWT, message, group, poll, or storage logic is changed.
- No production merge or deployment is included.
- Deploy only to the dedicated Render test service for verification.

## Test checklist
- Existing user can log in.
- All classic and new theme choices appear.
- Changing theme updates the profile preview immediately.
- Saving and reloading preserves the selected theme.
- Theme is visible on social profile cards.
- Full name, profile photo, privacy disclosure, and editing still work.
- Mobile layout remains usable.
