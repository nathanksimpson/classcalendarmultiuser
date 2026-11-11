-- Class board lives outside the calendar document. Bodies use the same
-- envelope columns as other blobs (body / body_enc_version / body_key_wrapped).

CREATE TABLE IF NOT EXISTS board_posts (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    board_kind TEXT NOT NULL,
    board_ref TEXT NOT NULL DEFAULT '',
    lesson_date TEXT,
    author_user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    body_enc_version INTEGER NOT NULL DEFAULT 0,
    body_key_wrapped TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    is_special INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_board_posts_board
    ON board_posts(calendar_id, board_kind, board_ref, created_at);
CREATE INDEX IF NOT EXISTS idx_board_posts_lesson
    ON board_posts(calendar_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_board_posts_author
    ON board_posts(author_user_id);
CREATE INDEX IF NOT EXISTS idx_board_posts_calendar_created
    ON board_posts(calendar_id, created_at, id);

CREATE TABLE IF NOT EXISTS board_post_students (
    post_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    student_id TEXT NOT NULL DEFAULT '',
    tms_mpidx TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (post_id, student_id, tms_mpidx)
);

CREATE INDEX IF NOT EXISTS idx_board_post_students_student
    ON board_post_students(student_id);
CREATE INDEX IF NOT EXISTS idx_board_post_students_tms
    ON board_post_students(tms_mpidx);
CREATE INDEX IF NOT EXISTS idx_board_post_students_calendar
    ON board_post_students(calendar_id, student_id);

CREATE TABLE IF NOT EXISTS board_post_mentions (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_post_mentions_user
    ON board_post_mentions(user_id);

CREATE TABLE IF NOT EXISTS board_replies (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    body_enc_version INTEGER NOT NULL DEFAULT 0,
    body_key_wrapped TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_board_replies_post
    ON board_replies(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_replies_author
    ON board_replies(author_user_id);

CREATE TABLE IF NOT EXISTS board_reactions (
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (target_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_board_reactions_target
    ON board_reactions(target_id);

CREATE TABLE IF NOT EXISTS board_revisions (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    body TEXT NOT NULL,
    body_enc_version INTEGER NOT NULL DEFAULT 0,
    body_key_wrapped TEXT,
    editor_user_id TEXT NOT NULL,
    edited_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_revisions_target
    ON board_revisions(target_id, edited_at);

CREATE TABLE IF NOT EXISTS board_read_state (
    user_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    board_key TEXT NOT NULL,
    last_read_at TEXT NOT NULL,
    PRIMARY KEY (user_id, calendar_id, board_key)
);
