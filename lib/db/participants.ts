import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];

export async function addParticipant(input: {
  sessionId: string;
  userId: string | null;
  displayName: string;
}): Promise<ParticipantRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("participants")
    .insert({
      session_id: input.sessionId,
      user_id: input.userId,
      display_name: input.displayName,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getParticipantsForSession(
  sessionId: string
): Promise<ParticipantRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("participants")
    .select()
    .eq("session_id", sessionId);

  if (error) throw new Error(error.message);
  return data;
}

export async function getParticipantByUserAndSession(
  sessionId: string,
  userId: string
): Promise<ParticipantRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("participants")
    .select()
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateParticipantStatus(
  id: string,
  status: ParticipantRow["status"]
): Promise<ParticipantRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("participants")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
