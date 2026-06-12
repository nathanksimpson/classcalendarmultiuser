CREATE TABLE IF NOT EXISTS user_notification_meta (
    user_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    notification_id TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    dismissed_at INTEGER,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, calendar_id, notification_id)
);
CREATE INDEX IF NOT EXISTS idx_user_notification_meta_calendar
  ON user_notification_meta(calendar_id, user_id);
