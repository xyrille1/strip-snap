import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/daily-metrics — Vercel Cron: nightly `daily_metrics` rollup.
 * Real implementation (Step 4 Item 9b): guard with a CRON_SECRET header;
 * aggregate the prior day's rows via lib/db/analyticsEvents.ts#getEventsBetween
 * into a `daily_metrics` upsert.
 */
export async function GET(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      day: new Date().toISOString().slice(0, 10),
      sessionsStarted: 0,
      stripsCompleted: 0,
      uniqueParticipants: 0,
    },
    { status: 501 }
  );
}
