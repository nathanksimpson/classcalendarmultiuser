-- Remembers which day note a board post was copied from, so import can run again safely.
ALTER TABLE board_posts ADD COLUMN source_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_posts_source ON board_posts(calendar_id, source_ref);
