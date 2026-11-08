# Phase 27 — Group Events and Scheduling

## Features
- Additive SQLite tables for group events and per-member RSVPs.
- Group members can list events and create events with a title, description, date/time, and optional location or meeting link.
- Date/time values are submitted with an explicit timezone offset and stored in UTC.
- Members can set or change an RSVP: Going, Maybe, or Not going.
- Event cards show RSVP totals and participant usernames by response.
- The event creator or a group admin can cancel an event; cancelled event details and RSVP history remain visible.
- Socket.IO broadcasts event changes to the group room so open clients can refresh.
- Event creation/cancellation is recorded in group activity.

## Security and validation
- All event endpoints require an authenticated group member.
- Event creation validates title, description, location, timestamp, supported reminder preference, and a scheduling window of now through one year ahead.
- RSVP is rejected for cancelled events.
- Cancellation is restricted to the event creator or a group admin.
- All schema changes are additive; existing messages, members, polls, and user data are not deleted.

## Reminder limitation
The reminder interval is saved with the event as a preference. Automatic scheduled notifications are not implemented in this phase and must not be represented as active reminders. A later phase can add a reliable server-side reminder worker and in-app/push delivery.

## Validation status
- JavaScript syntax checks passed for `src/db.js`, `src/routes/groups.js`, and `public/app.js`.
- Runtime migration, authenticated API, multi-account RSVP, cancellation, and realtime tests remain required on the isolated Render test service.
- Do not merge this draft PR or deploy to production without explicit approval.
