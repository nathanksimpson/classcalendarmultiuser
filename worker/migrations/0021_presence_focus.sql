-- What each person is working on (e.g. classes:<id>), so the app can warn when two
-- accounts edit the same thing at once. Short-lived; follows last_seen_at.
ALTER TABLE user_presence ADD COLUMN focus TEXT;
ALTER TABLE user_presence ADD COLUMN focus_label TEXT;
