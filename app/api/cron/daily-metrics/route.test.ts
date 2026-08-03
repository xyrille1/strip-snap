import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  throw new Error(
    "CRON_SECRET must be set in .env.local for this test to run meaningfully"
  );
}

function cronRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/daily-metrics", {
    method: "GET",
    headers,
  });
}

/** Midnight UTC for `daysAgo` days before today, matching the route's own boundary computation. */
function utcMidnightDaysAgo(daysAgo: number): Date {
  const now = new Date();
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return new Date(startOfToday - daysAgo * 24 * 60 * 60 * 1000);
}

describe("GET /api/cron/daily-metrics (integration, live local Supabase)", () => {
  const insertedEventIds: string[] = [];
  let appUserAId: string | null = null;
  let appUserBId: string | null = null;
  const daysToCleanUp: string[] = [];

  afterEach(async () => {
    const supabase = createServiceRoleClient();
    if (insertedEventIds.length) {
      await supabase
        .from("analytics_events")
        .delete()
        .in("id", insertedEventIds);
      insertedEventIds.length = 0;
    }
    if (daysToCleanUp.length) {
      await supabase.from("daily_metrics").delete().in("day", daysToCleanUp);
      daysToCleanUp.length = 0;
    }
    for (const id of [appUserAId, appUserBId]) {
      if (id) await supabase.from("app_users").delete().eq("id", id);
    }
    appUserAId = null;
    appUserBId = null;
  });

  it("returns 401 when no Authorization header is present", async () => {
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
  });

  it("returns 401 when the Authorization header has the wrong secret", async () => {
    const response = await GET(
      cronRequest({ authorization: "Bearer wrong-secret" })
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET is not configured server-side", async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const response = await GET(
        cronRequest({ authorization: `Bearer ${original}` })
      );
      expect(response.status).toBe(500);
    } finally {
      process.env.CRON_SECRET = original;
    }
  });

  it("aggregates yesterday's events into daily_metrics and excludes events outside the window", async () => {
    const supabase = createServiceRoleClient();
    const userA = await getOrCreateByClerkId(`clerk_test_${crypto.randomUUID()}`);
    appUserAId = userA.id;
    const userB = await getOrCreateByClerkId(`clerk_test_${crypto.randomUUID()}`);
    appUserBId = userB.id;

    const yesterday = utcMidnightDaysAgo(1);
    const yesterdayNoon = new Date(yesterday.getTime() + 12 * 60 * 60 * 1000);
    const dayString = yesterday.toISOString().slice(0, 10);
    daysToCleanUp.push(dayString);

    // Baseline: this is a shared, long-lived local dev Supabase instance, and
    // other test files (app/api/sessions/route.test.ts,
    // app/api/strips/route.test.ts, lib/db/analyticsEvents.test.ts) also
    // insert real analytics_events rows over the course of a session's test
    // runs. Some of those can outlive their own afterEach cleanup (e.g. a
    // previously-interrupted run), so this test cannot assume "yesterday's
    // window contains only what I'm about to insert." Instead of asserting
    // hard-coded absolute counts (which silently assumes a pristine window --
    // the actual bug that made this test flaky against real pollution),
    // baseline whatever's already in the window first and assert the DELTA
    // this test's own inserts produce. This exercises the exact same
    // route/getEventsBetween behavior without depending on DB cleanliness.
    const endOfYesterday = new Date(utcMidnightDaysAgo(0).getTime() - 1);
    const { data: baselineRows, error: baselineError } = await supabase
      .from("analytics_events")
      .select("event,user_id")
      .gte("created_at", yesterday.toISOString())
      .lte("created_at", endOfYesterday.toISOString());
    if (baselineError) throw new Error(baselineError.message);
    const baselineSessionsStarted = baselineRows.filter(
      (e) => e.event === "session_started"
    ).length;
    const baselineStripsCompleted = baselineRows.filter(
      (e) => e.event === "strip_completed"
    ).length;
    const baselineUniqueParticipants = new Set(
      baselineRows.filter((e) => e.user_id !== null).map((e) => e.user_id)
    ).size;

    const rows: {
      event: "session_started" | "strip_completed";
      user_id: string | null;
      created_at: string;
    }[] = [
      { event: "session_started", user_id: userA.id, created_at: yesterdayNoon.toISOString() },
      { event: "session_started", user_id: null, created_at: new Date(yesterdayNoon.getTime() + 60_000).toISOString() },
      { event: "strip_completed", user_id: userA.id, created_at: new Date(yesterdayNoon.getTime() + 120_000).toISOString() },
      { event: "strip_completed", user_id: userB.id, created_at: new Date(yesterdayNoon.getTime() + 180_000).toISOString() },
    ];

    for (const row of rows) {
      const { data, error } = await supabase
        .from("analytics_events")
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(error.message);
      insertedEventIds.push(data.id);
    }

    // Outside the window (today) -- must not be counted.
    const { data: todayEvent, error: todayError } = await supabase
      .from("analytics_events")
      .insert({ event: "session_started", user_id: null })
      .select()
      .single();
    if (todayError) throw new Error(todayError.message);
    insertedEventIds.push(todayEvent.id);

    const response = await GET(
      cronRequest({ authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.day).toBe(dayString);
    expect(body.sessionsStarted).toBe(baselineSessionsStarted + 2);
    expect(body.stripsCompleted).toBe(baselineStripsCompleted + 2);
    // userA appears in both a session_started and a strip_completed row --
    // counted once. userB appears once. Anonymous (null) rows excluded.
    // userA/userB are freshly-created app_users rows (random clerk ids), so
    // they cannot already be part of the baseline's distinct user_id set.
    expect(body.uniqueParticipants).toBe(baselineUniqueParticipants + 2);

    const { data: persisted, error: persistedError } = await supabase
      .from("daily_metrics")
      .select()
      .eq("day", dayString)
      .maybeSingle();
    if (persistedError) throw new Error(persistedError.message);
    expect(persisted).not.toBeNull();
    expect(persisted?.sessions_started).toBe(baselineSessionsStarted + 2);
    expect(persisted?.strips_completed).toBe(baselineStripsCompleted + 2);
    expect(persisted?.unique_participants).toBe(baselineUniqueParticipants + 2);
  });

  it("upserts (overwrites) an existing daily_metrics row for the same day on a re-run", async () => {
    const supabase = createServiceRoleClient();
    const yesterday = utcMidnightDaysAgo(1);
    const dayString = yesterday.toISOString().slice(0, 10);
    daysToCleanUp.push(dayString);

    const { error: seedError } = await supabase
      .from("daily_metrics")
      .insert({
        day: dayString,
        sessions_started: 999,
        strips_completed: 999,
        unique_participants: 999,
      });
    if (seedError) throw new Error(seedError.message);

    // Baseline the day's real analytics_events (this test inserts none of
    // its own) BEFORE calling the route, so the assertion below proves the
    // route recomputed and overwrote the 999 sentinel with the true count for
    // the day -- rather than assuming the window is empty (0), which doesn't
    // hold on a shared dev DB that can carry over rows from other test files.
    // See the sibling test above for the full rationale.
    const endOfYesterday = new Date(utcMidnightDaysAgo(0).getTime() - 1);
    const { data: baselineRows, error: baselineError } = await supabase
      .from("analytics_events")
      .select("event,user_id")
      .gte("created_at", yesterday.toISOString())
      .lte("created_at", endOfYesterday.toISOString());
    if (baselineError) throw new Error(baselineError.message);
    const expectedSessionsStarted = baselineRows.filter(
      (e) => e.event === "session_started"
    ).length;
    const expectedStripsCompleted = baselineRows.filter(
      (e) => e.event === "strip_completed"
    ).length;
    const expectedUniqueParticipants = new Set(
      baselineRows.filter((e) => e.user_id !== null).map((e) => e.user_id)
    ).size;

    const response = await GET(
      cronRequest({ authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(response.status).toBe(200);

    const { data: persisted, error } = await supabase
      .from("daily_metrics")
      .select()
      .eq("day", dayString)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Proves the upsert actually overwrote the seeded sentinel (999), not
    // just left it in place.
    expect(persisted?.sessions_started).not.toBe(999);
    expect(persisted?.sessions_started).toBe(expectedSessionsStarted);
    expect(persisted?.strips_completed).toBe(expectedStripsCompleted);
    expect(persisted?.unique_participants).toBe(expectedUniqueParticipants);
  });
});
