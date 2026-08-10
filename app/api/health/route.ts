import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — uptime-monitor target (ops-runbook.md §8, step 0 of the
 * incident checklist). Distinct from a real cron job (app/api/cron/*, which
 * does actual work and is auth-gated) and from a full page load (which pulls
 * in Clerk, fonts, etc.) — this is the cheapest possible signal that the app
 * is up and can reach its database.
 *
 * Unauthenticated by design: an uptime monitor needs to hit this without a
 * secret, and it reveals nothing beyond "the DB responded" (no row data is
 * returned).
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("app_users").select("id").limit(1);
    if (error) throw new Error(error.message);

    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "api", route: "health" } });
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
