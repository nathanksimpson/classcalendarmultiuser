-- Presence (matches production schema: last_seen_at, display_name on row)
CREATE TABLE IF NOT EXISTS user_presence (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    calendar_id TEXT,
    calendar_name TEXT,
    last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_presence_calendar ON user_presence(calendar_id, last_seen_at);
