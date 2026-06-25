-- Run in Supabase SQL Editor
ALTER TABLE executions ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS error_message text;
