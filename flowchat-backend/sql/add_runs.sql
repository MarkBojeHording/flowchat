-- Run in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS topup_runs integer DEFAULT 0;

CREATE OR REPLACE FUNCTION add_runs(user_id_input uuid, runs_to_add integer)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET topup_runs = topup_runs + runs_to_add,
      updated_at = now()
  WHERE id = user_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
