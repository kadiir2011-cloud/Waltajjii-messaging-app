-- Phase 105: persist group-call hand-raise state for all realtime instances.
-- Apply only after migration 006 in an isolated Waltajjii staging database.
BEGIN;
SET LOCAL search_path = waltajjii;
ALTER TABLE realtime_call_participants
  ADD COLUMN IF NOT EXISTS hand_raised BOOLEAN NOT NULL DEFAULT FALSE;
COMMIT;
