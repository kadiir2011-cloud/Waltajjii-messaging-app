-- Phase 106: indexes for shared direct-call lookup and reconnect recovery.
-- Apply only after migrations 006 and 007 in an isolated Waltajjii PostgreSQL
-- staging database. This migration does not alter the SQLite production schema.
BEGIN;
SET LOCAL search_path = waltajjii;

CREATE INDEX IF NOT EXISTS realtime_direct_call_active_participants
  ON realtime_call_participants(user_id, call_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS realtime_direct_call_active_sessions
  ON realtime_call_sessions(host_user_id, created_at DESC)
  WHERE call_type = 'direct' AND status = 'active';

COMMIT;
