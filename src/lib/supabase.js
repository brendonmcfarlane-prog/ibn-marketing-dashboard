import { createClient } from "@supabase/supabase-js";

let _client = null;

export function hasSupabaseConfig() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY env var is not set");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
