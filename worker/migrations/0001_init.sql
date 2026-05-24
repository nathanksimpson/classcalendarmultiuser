-- Cloudflare D1 schema (same as local SQLite)
CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    kakao_user_id TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'teacher',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao ON users(kakao_user_id) WHERE kakao_user_id IS NOT NULL AND kakao_user_id != '';
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_locks (
    calendar_id TEXT PRIMARY KEY,
    holder_user_id TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_history (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    saved_by_user_id TEXT,
    saved_by_name TEXT NOT NULL,
    saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_calendar ON calendar_history(calendar_id, revision DESC);
