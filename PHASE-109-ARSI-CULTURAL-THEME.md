# Phase 109 — Arsi cultural color theme

## Design inspiration
The theme is inspired by documented Arsi Oromo attire: warm brown/leather garment tones, black, red and white beadwork, with restrained green accents. The references describe these colors and the brown-dominant clothing. This is a contemporary digital interpretation, not a claim that every Arsi garment uses one fixed palette.

## Coverage
The palette is applied across the complete application: global backdrop and header, authenticated navigation, home dashboard, online people, messaging, conversation bubbles, composer, calls, social feed, groups, channels, profile, personalization, language tools, and dark mode.

## Implementation safety
- CSS-only change in `public/index.html`.
- No authentication, API, database, messaging, media, calls, groups, channels, AI or translation logic changed.
- Existing IDs and JavaScript feature handlers retained.

## Validation
Run `node --test test/phase109-arsi-cultural-theme.test.js`, plus the existing Phase 107/108 UI regression and Phase 78/79/80 suites. Manually review desktop and mobile, light and dark modes, and all authenticated sections after deployment.
