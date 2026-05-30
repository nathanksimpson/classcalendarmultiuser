ALTER TABLE sessions ADD COLUMN view_as_user_id TEXT;
CREATE TABLE IF NOT EXISTS view_as_exchanges (
    token TEXT PRIMARY KEY,
    session_token TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_view_as_exchanges_expires ON view_as_exchanges(expires_at);
