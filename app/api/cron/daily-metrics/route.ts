import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getEventsBetween } from "@/lib/db/analyticsEvents";
import { upsertDailyMetrics } from "@/lib/db/dailyMetrics";

/**
 * GET /api/cron/daily-metrics — Vercel Cron: nightly `daily_metrics` rollup
 * (TRD item 9b; backend-schema §3.6).
 *
 * This job runs nightly, so "the prior day" is computed as the full UTC day
 * that just elapsed relative to whenever this fires (not a rolling 24h
 * window) -- e.g. a run at 2026-08-03T02:00Z aggregates
 * [2026-08-02T00:00Z, 2026-08-03T00:00Z).
 *
 * Aggregation semantics, per backend-schema §3.6's column set (the only
 * columns available to derive these from):
 *  - `sessions_started` = count of `session_started` analytics_events rows
 *    in the window.
 *  - `strips_completed` = count of `strip_completed` analytics_events rows
 *    in the window.
 *  - `unique_participants` = count of DISTINCT non-null `user_id` values
 *    across BOTH event types in the window. `analytics_events` has no other
 *    per-person identity column, and anonymous rows (`user_id: null`) can't
 *    be attributed to a distinct person, so they're excluded from this
 *    count (they still count toward `sessions_started`/`strips_completed`).
 */
export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const startOfYesterday = new Date(
      startOfToday.getTime() - 24 * 60 * 60 * 1000
    );
    // Exclusive of "today": 1ms before startOfToday, so getEventsBetween's
    // inclusive `lte` doesn't pull in the first row of today.
    const endOfYesterday = new Date(startOfToday.getTime() - 1);

    const events = await getEventsBetween(startOfYesterday, endOfYesterday);

    const sessionsStarted = events.filter(
      (e) => e.event === "session_started"
    ).length;
    const stripsCompleted = events.filter(
      (e) => e.event === "strip_completed"
    ).length;
    const uniqueParticipants = new Set(
      events.filter((e) => e.user_id !== null).map((e) => e.user_id)
    ).size;

    const day = startOfYesterday.toISOString().slice(0, 10);

    await upsertDailyMetrics({
      day,
      sessionsStarted,
      stripsCompleted,
      uniqueParticipants,
    });

    return NextResponse.json(
      {
        day,
        sessionsStarted,
        stripsCompleted,
        uniqueParticipants,
      },
      { status: 200 }
    );
  } catch (error) {
    // ops-runbook.md §7: cron job failures instrumentation — an unhandled
    // failure here means a night's daily_metrics row silently never lands,
    // which is otherwise invisible until someone notices a gap in the
    // dashboard.
    Sentry.captureException(error, {
      tags: { area: "cron", job: "daily-metrics" },
    });
    return NextResponse.json(
      { error: "daily-metrics cron job failed" },
      { status: 500 }
    );
  }
}
