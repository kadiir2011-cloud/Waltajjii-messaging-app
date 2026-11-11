-- Phase 60: retryable cleanup queue for unreferenced private media objects.
BEGIN;

CREATE TABLE IF NOT EXISTS media_storage_cleanup (
  media_id BIGINT PRIMARY KEY REFERENCES media_objects(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS media_storage_cleanup_created_idx
  ON media_storage_cleanup(created_at);

CREATE INDEX IF NOT EXISTS media_storage_cleanup_claimed_idx
  ON media_storage_cleanup(claimed_at,created_at);

COMMIT;
