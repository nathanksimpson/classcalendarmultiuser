-- Who is viewing which team calendar (heartbeat from poll)
CREATE TABLE IF NOT EXISTS user_presence (
    user_id TEXT PRIMARY KEY NOT NULL,
    calendar_id TEXT,
    calendar_name TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_presence_calendar ON user_presence(calendar_id, updated_at);
