import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { jwtVerify } from "jose";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";
import { createSession, deleteSession, getSessionById } from "@/lib/db/sessions";
import { getParticipantsForSession } from "@/lib/db/participants";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Mirrors app/api/sessions/route.test.ts's mocking pattern.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

// Partial mock, same technique as app/api/sessions/route.test.ts: every
// other export stays real/live, only `getSessionById` is wrapped so one test
// can force it to reject and exercise the route's catch block.
vi.mock("@/lib/db/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/sessions")>();
  return { ...actual, getSessionById: vi.fn(actual.getSessionById) };
});

const mockedAuth = vi.mocked(auth);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedGetSessionById = vi.mocked(getSessionById);

function joinRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/sessions/placeholder/join", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sessions/:id/join (integration, live local Supabase, Clerk auth() + rate limit mocked)", () => {
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
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const response = await POST(joinRequest({ displayName: "" }), {
      params: { id: session.id },
    });

    expect(response.status).toBe(400);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed session id", async () => {
    const response = await POST(joinRequest({ displayName: "Guest" }), {
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 429 when the rate limiter denies the request", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;
    mockedCheckRateLimit.mockResolvedValue({ success: false });

    const response = await POST(joinRequest({ displayName: "Guest" }), {
      params: { id: session.id },
    });

    expect(response.status).toBe(429);
  });

  it("returns 404 when the session does not exist", async () => {
    const response = await POST(joinRequest({ displayName: "Guest" }), {
      params: { id: "00000000-0000-0000-0000-000000000000" },
    });

    expect(response.status).toBe(404);
  });

  it("creates a new anonymous participant (201) and mints a realtime token scoped to session:{id}", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const response = await POST(joinRequest({ displayName: "Anon Guest" }), {
      params: { id: session.id },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.participant.session_id).toBe(session.id);
    expect(body.participant.user_id).toBeNull();
    expect(body.participant.display_name).toBe("Anon Guest");
    expect(typeof body.realtimeToken).toBe("string");

    const { payload } = await jwtVerify(
      body.realtimeToken,
      new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!),
      { algorithms: ["HS256"] }
    );
    expect(payload.topic).toBe(`session:${session.id}`);
    expect(payload.session_id).toBe(session.id);
    expect(payload.participant_id).toBe(body.participant.id);
    expect(payload.role).toBe("authenticated");

    const participants = await getParticipantsForSession(session.id);
    expect(participants).toHaveLength(1);
  });

  it("allows multiple distinct anonymous participants to join the same session", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const first = await POST(joinRequest({ displayName: "Guest 1" }), {
      params: { id: session.id },
    });
    const second = await POST(joinRequest({ displayName: "Guest 2" }), {
      params: { id: session.id },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.participant.id).not.toBe(secondBody.participant.id);

    const participants = await getParticipantsForSession(session.id);
    expect(participants).toHaveLength(2);
  });

  it("creates a new logged-in participant (201) with user_id set", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    mockedAuth.mockResolvedValue({ userId: clerkId } as Awaited<
      ReturnType<typeof auth>
    >);

    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const response = await POST(joinRequest({ displayName: "Signed-in Guest" }), {
      params: { id: session.id },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.participant.user_id).not.toBeNull();
    appUserId = body.participant.user_id;
  });

  it("returns the SAME participant (200, not 201/500) when a logged-in user re-joins the same session", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    mockedAuth.mockResolvedValue({ userId: clerkId } as Awaited<
      ReturnType<typeof auth>
    >);

    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const first = await POST(joinRequest({ displayName: "Signed-in Guest" }), {
      params: { id: session.id },
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    appUserId = firstBody.participant.user_id;

    const second = await POST(joinRequest({ displayName: "Signed-in Guest" }), {
      params: { id: session.id },
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.participant.id).toBe(firstBody.participant.id);
    // mintRealtimeToken is called again on every re-join (not skipped/cached) — verified via a
    // fresh, independently-valid JWT rather than byte-inequality with the first token, since
    // jose's HS256 signing is deterministic and two joins in the same wall-clock second produce
    // identical claims (including iat/exp), so the two token strings may legitimately match.
    expect(typeof secondBody.realtimeToken).toBe("string");
    const { payload: secondPayload } = await jwtVerify(
      secondBody.realtimeToken,
      new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!),
      { algorithms: ["HS256"] }
    );
    expect(secondPayload.participant_id).toBe(firstBody.participant.id);
    expect(secondPayload.topic).toBe(`session:${session.id}`);

    const participants = await getParticipantsForSession(session.id);
    expect(participants).toHaveLength(1);
  });

  it("returns 500 with the app's JSON error shape when an unexpected DB error is thrown", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;
    mockedGetSessionById.mockRejectedValueOnce(new Error("boom"));

    const response = await POST(joinRequest({ displayName: "Guest" }), {
      params: { id: session.id },
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to join session" });
  });
});
