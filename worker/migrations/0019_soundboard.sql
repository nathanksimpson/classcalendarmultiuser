CREATE TABLE IF NOT EXISTS soundboard_board (
    id TEXT PRIMARY KEY,
    board_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT
);
