CREATE TABLE IF NOT EXISTS calendar_suggestions (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    base_revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    summary TEXT,
    created_by_user_id TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_suggestions_calendar ON calendar_suggestions(calendar_id, status);

CREATE TABLE IF NOT EXISTS user_presence (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    calendar_id TEXT,
    calendar_name TEXT,
    last_seen_at TEXT NOT NULL
);
