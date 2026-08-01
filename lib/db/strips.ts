import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type StripRow = Database["public"]["Tables"]["strips"]["Row"];

export async function createStrip(input: {
  sessionId: string;
  stylePreset: string;
  storagePath: string;
}): Promise<StripRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("strips")
    .insert({
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
