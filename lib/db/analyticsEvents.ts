import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AnalyticsEventRow = Database["public"]["Tables"]["analytics_events"]["Row"];

export async function recordEvent(input: {
  sessionId: string | null;
  event: "session_started" | "strip_completed";
  userId: string | null;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("analytics_events").insert({
    session_id: input.sessionId,
    event: input.event,
    user_id: input.userId,
  });

  if (error) throw new Error(error.message);
}

export async function getEventsBetween(
  start: Date,
  end: Date
): Promise<AnalyticsEventRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("analytics_events")
    .select()
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (error) throw new Error(error.message);
  return data;
}
