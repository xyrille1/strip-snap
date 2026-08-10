import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/**
 * Vercel can freeze this function between invocations and reuse the same
 * warm container (and this module's cached `client` singleton below) for the
 * next request. If Supabase's edge closes the pooled keep-alive socket while
 * frozen, Node doesn't notice until it tries to write to it — the request
 * fails immediately with a bare `TypeError: fetch failed`, no HTTP response
 * involved (observed in production, 2026-08-10: consistently reproducible on
 * warm invocations while a fresh connection, e.g. a one-off curl, always
 * succeeds). Retrying once forces a new connection instead of reusing the
 * dead one — the standard mitigation for this supabase-js-on-serverless
 * failure mode.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return fetch(input, init);
  }
}

/**
 * Service-role client. Server-side only (enforced by `server-only`) — bypasses RLS
 * entirely and is the sole read/write path for application tables, per
 * docs/online-photobooth-backend-schema.md §1/§5. Never import this from client code.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  client = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry },
  });

  return client;
}
