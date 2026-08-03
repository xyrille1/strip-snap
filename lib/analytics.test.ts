import { describe, it, expect, vi, afterEach } from "vitest";
import { createServiceRoleClient } from "@/lib/supabase/server";
import * as analyticsEventsDb from "@/lib/db/analyticsEvents";
import { trackEvent } from "@/lib/analytics";

describe("lib/analytics#trackEvent (integration, live local Supabase)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes its input straight through to lib/db/analyticsEvents#recordEvent and persists a row", async () => {
    await trackEvent({ sessionId: null, event: "session_started", userId: null });

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

    await supabase.from("analytics_events").delete().eq("id", data![0].id);
  });

  it("does not reject when the underlying recordEvent call fails (analytics failures must never break the caller's flow)", async () => {
    vi.spyOn(analyticsEventsDb, "recordEvent").mockRejectedValueOnce(
      new Error("db unreachable")
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      trackEvent({ sessionId: null, event: "session_started", userId: null })
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
