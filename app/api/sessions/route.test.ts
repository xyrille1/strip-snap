import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";
import { deleteSession } from "@/lib/db/sessions";
import { getParticipantsForSession } from "@/lib/db/participants";
import { createServiceRoleClient } from "@/lib/supabase/server";

// The route only imports `auth` from this module (mirrors
// app/api/sessions/[id]/upgrade/route.test.ts) — mocking just that export is
// sufficient.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// checkRateLimit fails open when Upstash isn't configured (always true) —
// mocking it directly is the only way to exercise the 429 path and to prove
// the route actually calls it (not dead code) without a live Redis instance.
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function sessionsRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sessions (integration, live local Supabase, Clerk auth() + rate limit mocked)", () => {
  let sessionId: string | null = null;
  let appUserId: string | null = null;

  beforeEach(() => {
    mockedAuth.mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);
    mockedCheckRateLimit.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    mockedAuth.mockReset();
    mockedCheckRateLimit.mockReset();

    if (sessionId) {
      const supabase = createServiceRoleClient();
      await supabase.from("analytics_events").delete().eq("session_id", sessionId);
      await deleteSession(sessionId);
      sessionId = null;
    }
    if (appUserId) {
      const supabase = createServiceRoleClient();
      await supabase.from("app_users").delete().eq("id", appUserId);
      appUserId = null;
    }
  });

  it("returns 400 for an invalid body and never checks the rate limit", async () => {
    const response = await POST(sessionsRequest({ mode: "party" }));

    expect(response.status).toBe(400);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limiter denies the request", async () => {
    mockedCheckRateLimit.mockResolvedValue({ success: false });

    const response = await POST(sessionsRequest({ mode: "solo" }));

    expect(response.status).toBe(429);
  });

  it("keys the rate limiter by the request's client IP, at the ~10/hour threshold", async () => {
    const response = await POST(
      sessionsRequest(
        { mode: "solo" },
        { "x-forwarded-for": "203.0.113.5, 70.41.3.18" }
      )
    );
    const body = await response.json();
    sessionId = body.id;

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("203.0.113.5"),
      { limit: 10, windowSeconds: 60 * 60 }
    );
  });

  it("creates a solo session, an anonymous host participant row, and returns { id, join_url }", async () => {
    const response = await POST(sessionsRequest({ mode: "solo" }));

    expect(response.status).toBe(201);
    const body = await response.json();
    sessionId = body.id;

    expect(typeof body.id).toBe("string");
    expect(body.join_url).toBe(`/session/${body.id}/waiting`);

    const participants = await getParticipantsForSession(body.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].display_name).toBe("Host");
    expect(participants[0].user_id).toBeNull();
    expect(participants[0].session_id).toBe(body.id);

    // Phase 11: session creation records a `session_started` analytics event
    // with a null user_id for an anonymous creator.
    const supabase = createServiceRoleClient();
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select()
      .eq("session_id", body.id)
      .eq("event", "session_started");
    if (error) throw new Error(error.message);
    expect(events).toHaveLength(1);
    expect(events![0].user_id).toBeNull();
  });

  it("creates an invite session with a host participant row", async () => {
    const response = await POST(sessionsRequest({ mode: "invite" }));

    expect(response.status).toBe(201);
    const body = await response.json();
    sessionId = body.id;
    expect(body.join_url).toBe(`/session/${body.id}/waiting`);

    const participants = await getParticipantsForSession(body.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].display_name).toBe("Host");
  });

  it("attaches host_user_id and the participant's user_id when the creator is signed in", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    mockedAuth.mockResolvedValue({ userId: clerkId } as Awaited<
      ReturnType<typeof auth>
    >);

    const response = await POST(sessionsRequest({ mode: "invite" }));

    expect(response.status).toBe(201);
    const body = await response.json();
    sessionId = body.id;

    const supabase = createServiceRoleClient();
    const { data: session } = await supabase
      .from("sessions")
      .select()
      .eq("id", body.id)
      .single();
    expect(session?.host_user_id).not.toBeNull();
    appUserId = session?.host_user_id ?? null;

    const participants = await getParticipantsForSession(body.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].user_id).toBe(session?.host_user_id);

    // Phase 11: for a logged-in creator, the `session_started` event's
    // user_id is the same resolved app_users.id as the participant row's
    // (and the session's host_user_id) -- not re-derived separately.
    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select()
      .eq("session_id", body.id)
      .eq("event", "session_started");
    if (eventsError) throw new Error(eventsError.message);
    expect(events).toHaveLength(1);
    expect(events![0].user_id).toBe(session?.host_user_id);
  });
});
