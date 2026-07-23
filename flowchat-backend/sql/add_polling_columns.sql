-- Required for Google Sheets / Gmail polling triggers
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS poll_cursor jsonb DEFAULT NULL;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS last_polled_at timestamptz DEFAULT NULL;
