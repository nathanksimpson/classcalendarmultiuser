ALTER TABLE calendars ADD COLUMN data_enc_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendars ADD COLUMN data_key_wrapped TEXT;

ALTER TABLE calendar_suggestions ADD COLUMN data_enc_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_suggestions ADD COLUMN data_key_wrapped TEXT;
