-- Run in Supabase SQL Editor
CREATE OR REPLACE FUNCTION increment_runs_used(user_id_input uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET runs_used = runs_used + 1,
      updated_at = now()
  WHERE id = user_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
