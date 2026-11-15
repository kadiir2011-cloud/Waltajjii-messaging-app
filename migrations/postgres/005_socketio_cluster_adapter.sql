-- Phase 103: Socket.IO PostgreSQL adapter attachment storage.
-- Run only in the isolated Waltajjii PostgreSQL schema after migrations 001-004.
BEGIN;
CREATE SCHEMA IF NOT EXISTS waltajjii;
SET LOCAL search_path = waltajjii;
CREATE TABLE IF NOT EXISTS socket_io_attachments (
  id BIGSERIAL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload BYTEA
);
CREATE INDEX IF NOT EXISTS idx_socket_io_attachments_created_at
  ON socket_io_attachments(created_at);
COMMIT;
