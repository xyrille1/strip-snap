import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];

export async function createSession(input: {
  mode: "solo" | "invite";
  hostUserId: string | null;
}): Promise<SessionRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({ mode: input.mode, host_user_id: input.hostUserId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getSessionById(id: string): Promise<SessionRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSessionFormat(
  id: string,
  format: "3" | "4"
): Promise<SessionRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ format })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSessionStatus(
  id: string,
  status: SessionRow["status"]
): Promise<SessionRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function markSessionCompleted(id: string): Promise<SessionRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getExpiredSessions(): Promise<SessionRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .select()
    .neq("status", "expired")
    .lt("expires_at", new Date().toISOString());

  if (error) throw new Error(error.message);
  return data;
}

export async function expireSession(id: string): Promise<SessionRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ status: "expired" })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("sessions").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
