-- Run in Supabase SQL Editor
CREATE OR REPLACE FUNCTION increment_test_runs(user_id_input uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET test_runs_used = test_runs_used + 1,
      updated_at = now()
  WHERE id = user_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
