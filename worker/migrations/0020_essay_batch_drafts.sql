CREATE TABLE IF NOT EXISTS essay_batch_drafts (
    user_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    data TEXT NOT NULL,
    data_enc_version INTEGER NOT NULL DEFAULT 0,
    data_key_wrapped TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_essay_batch_drafts_calendar
  ON essay_batch_drafts(calendar_id, user_id);
