ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS consecutive_failures int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_type text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_message text;
