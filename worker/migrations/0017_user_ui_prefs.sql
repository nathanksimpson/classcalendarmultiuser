CREATE TABLE IF NOT EXISTS user_ui_prefs (
    user_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    prefs_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_user_ui_prefs_calendar
  ON user_ui_prefs(calendar_id, user_id);
