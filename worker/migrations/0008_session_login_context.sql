-- Per-session login context (personal vs shared/public computer)
ALTER TABLE sessions ADD COLUMN login_context TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE sessions ADD COLUMN idle_logout_minutes INTEGER;
ALTER TABLE sessions ADD COLUMN idle_warning_minutes INTEGER;
