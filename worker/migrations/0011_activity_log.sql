CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    calendar_id TEXT,
    calendar_name TEXT,
    summary TEXT NOT NULL,
    detail_json TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_calendar ON activity_log(calendar_id, created_at DESC);
