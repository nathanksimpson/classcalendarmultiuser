-- Track who created each team calendar (for creator-scoped manage/delete).
ALTER TABLE calendars ADD COLUMN created_by_user_id TEXT;
