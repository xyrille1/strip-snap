import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type StripRow = Database["public"]["Tables"]["strips"]["Row"];

export async function createStrip(input: {
  /**
   * Optional — lets the caller pre-generate the strip's id (e.g. via
   * `crypto.randomUUID()`) so the Storage object path
   * (`strips/{session_id}/{strip_id}.png`) can be constructed and the image
   * uploaded BEFORE the DB row is inserted, avoiding a "row exists but
   * points at a not-yet-uploaded object" window. Falls back to the table's
   * `default gen_random_uuid()` when omitted, so existing callers are
   * unaffected.
   */
  id?: string;
  sessionId: string;
  stylePreset: string;
  storagePath: string;
}): Promise<StripRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("strips")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      session_id: input.sessionId,
      style_preset: input.stylePreset,
      storage_path: input.storagePath,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getStripById(id: string): Promise<StripRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("strips")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * All strips belonging to a session -- used by the expire-sessions cron
 * (app/api/cron/expire-sessions/route.ts) to enumerate each strip's
 * `storage_path` and delete the Storage object BEFORE the session row (and
 * its cascaded strips rows) is deleted, since Postgres's `on delete cascade`
 * never touches Storage objects (backend-schema §7).
 */
export async function getStripsBySessionId(
  sessionId: string
): Promise<StripRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("strips")
    .select()
    .eq("session_id", sessionId);

  if (error) throw new Error(error.message);
  return data;
}
