import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AppUserRow = Database["public"]["Tables"]["app_users"]["Row"];

export async function getOrCreateByClerkId(clerkId: string): Promise<AppUserRow> {
  const supabase = createServiceRoleClient();

  const { data: existing, error: selectError } = await supabase
    .from("app_users")
    .select()
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("app_users")
    .insert({ clerk_id: clerkId })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);
  return created;
}

export async function softDeleteByClerkId(clerkId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("app_users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("clerk_id", clerkId);

  if (error) throw new Error(error.message);
}

export async function getById(id: string): Promise<AppUserRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_users")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
