import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import { isPrivilegedSupabaseKey } from "./credentials";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !isPrivilegedSupabaseKey(key)) throw new Error("Check-in storage requires a Supabase secret key or legacy service_role key, not a publishable key.");
  return createClient(getSupabaseConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
