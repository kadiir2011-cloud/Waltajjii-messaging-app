# Waltajjii Phase 4 — Polish and Reliability

## Branch and release safety
- Phase 4 is developed on `reliability-polish-phase4`, based on `groups-channels-phase3`.
- Deploy only to the separate Render test service.
- Do not modify or merge into production `main`.
- Keep all Phase 1–4 pull requests unmerged until end-to-end testing and explicit release approval.

## Goals
1. Mobile-first responsive interface and accessible controls.
3. User-facing notification preferences and privacy controls.
4. Security and operational hardening.
5. Durable database storage, backups, and recovery procedures.
6. Regression testing across authentication, profiles, direct messages, social features, groups, channels, uploads, and video calls.

## Implementation order

### 4.1 Baseline and safety
- Record current API routes, schema, environment variables, and deployment configuration.
- Add health/readiness checks that do not expose secrets or personal data.
- Add automated checks for syntax, route behavior, and security-sensitive configuration.
- Preserve backward compatibility and existing user data.

### 4.2 Multilingual interface
- Replace the currently decorative language selector with a real translation system.
- Translate navigation, headings, labels, buttons, placeholders, status messages, validation feedback, notifications, and dynamically rendered controls across all seven listed languages.
- Persist the selected language across reloads and apply it immediately without requiring a new login.
- Set document language and direction correctly; Arabic must use RTL layout while the other languages use LTR.
- Correct the currently garbled Amharic, Arabic, French, and Chinese option labels and verify Unicode rendering.
- Keep user-generated content (names, messages, posts, and channel content) unchanged; translate only application interface text.
- Test language switching on login, registration, messaging, groups, channels, calls, profiles, social feed, and notifications.

### 4.3 Mobile-first interface
- Audit the existing single-page interface at narrow viewport widths.
- Improve navigation, forms, chat panes, channel/group controls, and call controls for touch use.
- Add accessible labels, focus states, and status announcements.
- Test at phone, tablet, and desktop widths.

### 4.4 Notification and privacy controls
- Add user preferences only after defining each notification type and default.
- Enforce privacy choices on the server, not only by hiding UI.
- Avoid exposing private profiles, messages, or channel membership through discovery endpoints.
- Provide clear controls and explanatory text.

### 4.5 Security review
- Review authentication, authorization, rate limits, input validation, upload handling, Socket.IO events, and security headers.
- Ensure secrets remain server-side and are never logged or returned to clients.
- Add regression tests for unauthorized access and cross-user data isolation.

### 4.6 Durable data and backups
- Current database implementation uses SQLite at `STORAGE_DIR` (or the local `data` folder). Render's ephemeral filesystem can lose data on redeploy/restart.
- Before changing database technology or storage configuration, choose and verify a durable target (persistent disk or managed PostgreSQL), confirm cost/availability, and design a tested migration with backup and rollback.
- Never run destructive schema changes or migrate production data without an explicit approval and verified backup.
- Test restore into a separate test environment before release.

## Acceptance criteria
- No regressions in existing Phase 1–3 features or video calling.
- Phone/tablet/desktop UI checks pass.
- Privacy settings are enforced by API authorization.
- Security checks and automated tests pass.
- Data survives test-service redeploy/restart and a backup can be restored successfully.
- Production `main` remains untouched until the user explicitly approves the coordinated release.
