import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/**
 * Anon-key client for Supabase Realtime (presence/broadcast) only, per
 * docs/online-photobooth-backend-schema.md §4 — RLS denies all table reads/writes for
 * this key by design. Never use this client for table queries; use lib/db/*.ts
 * (server-side, service role) for any table access instead.
 */
export function createRealtimeClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
