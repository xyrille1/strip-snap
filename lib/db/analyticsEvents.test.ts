import { describe, it, expect, afterEach } from "vitest";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recordEvent, getEventsBetween } from "@/lib/db/analyticsEvents";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";

describe("lib/db/analyticsEvents (integration, live local Supabase)", () => {
  let sessionId: string | null = null;
  let appUserId: string | null = null;
  const insertedEventIds: string[] = [];

  afterEach(async () => {
    const supabase = createServiceRoleClient();
    if (insertedEventIds.length) {
      await supabase.from("analytics_events").delete().in("id", insertedEventIds);
      insertedEventIds.length = 0;
    }
    if (sessionId) {
      await deleteSession(sessionId);
      sessionId = null;
    }
    if (appUserId) {
      await supabase.from("app_users").delete().eq("id", appUserId);
      appUserId = null;
    }
  });

  it("inserts an event with null session_id and null user_id (anonymous session creation)", async () => {
    await recordEvent({ sessionId: null, event: "session_started", userId: null });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("analytics_events")
      .select()
      .eq("event", "session_started")
      .is("session_id", null)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    expect(data).toHaveLength(1);
    insertedEventIds.push(data![0].id);
  });

  it("inserts an event with non-null session_id and user_id", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    const appUser = await getOrCreateByClerkId(clerkId);
    appUserId = appUser.id;

    await recordEvent({
      sessionId: session.id,
      event: "strip_completed",
      userId: appUser.id,
    });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("analytics_events")
      .select()
      .eq("session_id", session.id)
      .eq("user_id", appUser.id)
      .eq("event", "strip_completed");
    if (error) throw new Error(error.message);
    expect(data).toHaveLength(1);
    insertedEventIds.push(data![0].id);
  });

  it("getEventsBetween returns rows inside the given date range and excludes rows outside it", async () => {
    await recordEvent({ sessionId: null, event: "session_started", userId: null });

    const supabase = createServiceRoleClient();
    const { data: justInserted, error } = await supabase
      .from("analytics_events")
      .select()
      .is("session_id", null)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = justInserted![0];
    insertedEventIds.push(row.id);

    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 60_000);
    const withinRange = await getEventsBetween(start, end);
    expect(withinRange.some((r) => r.id === row.id)).toBe(true);

    const farPastStart = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const farPastEnd = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    const outsideRange = await getEventsBetween(farPastStart, farPastEnd);
    expect(outsideRange.some((r) => r.id === row.id)).toBe(false);
  });
});
