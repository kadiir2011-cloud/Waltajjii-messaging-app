# Phase 48 — PostgreSQL channel message interactions

## Database extension
Additive migration `002_channel_message_interactions.sql` adds channel message media metadata, edit/delete/pin timestamps and actor references, a normalized reaction table, and per-member delivery/read receipts. Existing channel messages remain intact.

## API behavior
- Reactions: member-only toggle, constrained supported emoji, one reaction per member/emoji/message.
- Receipts: delivery and read timestamps per recipient; reading channel history advances pending receipts.
- Editing: sender-only, active text messages only.
- Deletion: sender or channel admin; soft-delete preserves history while clearing media, reactions, and pin state.
- Pin/unpin: channel owner/admin only.
- Media: metadata only; actual file storage remains in the existing Supabase Storage integration and is not altered by this migration.

## Safety
This is a draft extension for review and disposable CI. It is not executed on live Supabase, not mounted in the running app, and does not deploy to Render.
