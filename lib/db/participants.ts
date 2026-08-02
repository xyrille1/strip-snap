import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];

/** Postgres unique-violation error code (backend-schema §3.3's `unique (session_id, user_id)`). */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * Thrown by `addParticipant` when the insert collides with the
 * `unique (session_id, user_id)` constraint — i.e. a logged-in user trying
 * to join a session they already have a participant row in. Anonymous
 * participants (`user_id: null`) can never trigger this (backend-schema
 * §3.3 — Postgres treats null as distinct in unique constraints).
 */
export class UniqueParticipantError extends Error {
  constructor() {
    super("A participant row for this session_id/user_id already exists");
    this.name = "UniqueParticipantError";
  }
}

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

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new UniqueParticipantError();
    }
    throw new Error(error.message);
  }
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
