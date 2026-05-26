-- Global permissions JSON on users; per-calendar access levels
ALTER TABLE users ADD COLUMN permissions TEXT;

ALTER TABLE calendar_members ADD COLUMN access_level TEXT NOT NULL DEFAULT 'editor';
ALTER TABLE calendar_groups ADD COLUMN access_level TEXT NOT NULL DEFAULT 'editor';
