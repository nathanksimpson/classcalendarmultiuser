-- Multi-device sessions: public id + metadata; session-scoped calendar locks.
ALTER TABLE sessions ADD COLUMN id TEXT;
ALTER TABLE sessions ADD COLUMN created_at TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

UPDATE sessions SET id = token WHERE id IS NULL OR id = '';
UPDATE sessions SET created_at = expires_at WHERE created_at IS NULL OR created_at = '';
UPDATE sessions SET last_seen_at = expires_at WHERE last_seen_at IS NULL OR last_seen_at = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);

ALTER TABLE calendar_locks ADD COLUMN holder_session_token TEXT;
ALTER TABLE calendar_locks ADD COLUMN pending_requester_session_token TEXT;
