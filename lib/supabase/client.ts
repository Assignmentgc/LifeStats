"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabaseConfig();

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
