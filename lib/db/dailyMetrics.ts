import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DailyMetricsRow = Database["public"]["Tables"]["daily_metrics"]["Row"];

/**
 * Upserts the nightly rollup row for `day` (backend-schema §3.6), keyed by
 * the table's `day` primary key. Used by app/api/cron/daily-metrics/route.ts
 * -- re-running the cron for the same day (e.g. a retry) overwrites that
 * day's counts rather than accumulating duplicates.
 */
export async function upsertDailyMetrics(input: {
  /** ISO date string, 'YYYY-MM-DD'. */
  day: string;
  sessionsStarted: number;
  stripsCompleted: number;
  uniqueParticipants: number;
}): Promise<DailyMetricsRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("daily_metrics")
    .upsert(
      {
        day: input.day,
        sessions_started: input.sessionsStarted,
        strips_completed: input.stripsCompleted,
        unique_participants: input.uniqueParticipants,
      },
      { onConflict: "day" }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
