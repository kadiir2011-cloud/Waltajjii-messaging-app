-- Phase 48: channel message interaction metadata and receipts.
-- Additive migration. Apply only after reviewing in a disposable database.
BEGIN;
CREATE SCHEMA IF NOT EXISTS waltajjii;
SET LOCAL search_path = waltajjii;

ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS media_path TEXT;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS pinned_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE channel_messages ADD CONSTRAINT channel_messages_media_type_check
    CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS channel_message_reactions (
  channel_message_id BIGINT NOT NULL REFERENCES channel_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(channel_message_id,user_id,emoji)
);
CREATE INDEX IF NOT EXISTS idx_channel_message_reactions_message
  ON channel_message_reactions(channel_message_id,emoji);

CREATE TABLE IF NOT EXISTS channel_message_receipts (
  channel_message_id BIGINT NOT NULL REFERENCES channel_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  PRIMARY KEY(channel_message_id,user_id),
  CHECK (read_at IS NULL OR delivered_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_channel_message_receipts_user
  ON channel_message_receipts(user_id,read_at,channel_message_id);

CREATE INDEX IF NOT EXISTS idx_channel_messages_pinned
  ON channel_messages(channel_id,pinned_at) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_messages_active
  ON channel_messages(channel_id,id) WHERE deleted_at IS NULL;

COMMIT;
