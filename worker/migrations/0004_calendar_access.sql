-- Per-calendar access: direct users, groups, and group membership
CREATE TABLE IF NOT EXISTS calendar_members (
    calendar_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    granted_by_user_id TEXT,
    PRIMARY KEY (calendar_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_members_user ON calendar_members(user_id);

CREATE TABLE IF NOT EXISTS teacher_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS calendar_groups (
    calendar_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    granted_by_user_id TEXT,
    PRIMARY KEY (calendar_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_groups_group ON calendar_groups(group_id);

-- Existing calendars: grant all active users direct access (unchanged behavior until admin tightens)
INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, granted_at, granted_by_user_id)
SELECT c.id, u.id, datetime('now'), NULL
FROM calendars c
CROSS JOIN users u
WHERE u.active = 1;
