"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const env = requireSupabaseEnv();

  return createBrowserClient(env.url, env.publishableKey);
}
