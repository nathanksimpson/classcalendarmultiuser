-- Track when another user wants to edit while a calendar is locked
ALTER TABLE calendar_locks ADD COLUMN pending_requester_id TEXT;
ALTER TABLE calendar_locks ADD COLUMN pending_requester_name TEXT;
ALTER TABLE calendar_locks ADD COLUMN pending_requested_at TEXT;
