# Waltajjii Phase 3 — Groups and Channels

This branch builds on `social-connections-phase2`. It is intentionally separate from production `main`.

## Existing group features retained
- Create a group with up to 100 members.
- Group admins can add and remove members.
- Members can read and send group messages.

## New channel features
- Create public or private channels with a short description.
- Discover public channels; private channels are visible only to members.
- Join public channels.
- Channel owners/admins can invite members and remove non-owner members.
- Channel members can read the channel's announcement history.
- Only channel owners/admins can publish announcements (broadcast/read-only member model).
- Non-owner members can leave a channel.

## API
All endpoints require the existing Waltajjii Bearer JWT.

- `GET /api/channels` — list discoverable public channels and channels the user belongs to.
- `POST /api/channels` — create a channel: `{name, description, visibility: "public"|"private"}`.
- `POST /api/channels/:id/join` — join a public channel.
- `GET /api/channels/:id/members` — list members (members only).
- `POST /api/channels/:id/members` — invite by username (admins only).
- `DELETE /api/channels/:id/members/:userId` — remove a non-owner member (admins only).
- `GET /api/channels/:id/messages` — read announcements (members only).
- `POST /api/channels/:id/messages` — publish an announcement (admins only).
- `DELETE /api/channels/:id/leave` — leave a channel (owners must transfer ownership first; ownership transfer is not yet implemented).

## Database
Adds `channels`, `channel_members`, and `channel_messages` using additive `CREATE TABLE IF NOT EXISTS` migrations. Existing users, direct messages, groups, and Phase 2 social records are not intentionally modified.

## UI
The Channels panel is available after login. Use Create channel, choose PUBLIC or PRIVATE, and use the channel selector to open or join channels. Admins can manage members and publish announcements.

## Important limitations before production
- Channel announcements are stored in the app's existing SQLite database. Render's ephemeral filesystem can lose SQLite data after redeploy/replacement; production needs a persistent disk or a migration to managed PostgreSQL before real users rely on it.
- Channel message attachments, real-time push delivery, admin promotion/ownership transfer, moderation/reporting, and channel notification preferences are not included in this first Phase 3 increment.
- Private channels are invitation-only; no public directory exposure.
- This is a development increment and must be tested on the separate Render test service before any merge.
