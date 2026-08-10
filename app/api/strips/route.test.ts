import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";
import {
  createSession,
  deleteSession,
  getSessionById,
  updateSessionFormat,
} from "@/lib/db/sessions";
import { deleteStripImage } from "@/lib/storage";
import { createServiceRoleClient } from "@/lib/supabase/server";

// A minimal valid 1x1 transparent PNG, base64-encoded (same fixture as
// lib/storage.test.ts) — real image bytes so the upload path exercises
// actual Storage content handling, not a text placeholder.
const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// checkRateLimit fails open when Upstash isn't configured (always true) --
// mocking it directly is the only way to exercise the 429 path and to prove
// the route actually calls it (not dead code) without a live Redis instance.
// Mirrors app/api/sessions/route.test.ts's pattern.
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

// Partial mock: every other export stays real/live — only `getSessionById`
// is wrapped so one test can force it to reject and exercise the route's
// catch block.
vi.mock("@/lib/db/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/sessions")>();
  return { ...actual, getSessionById: vi.fn(actual.getSessionById) };
});

const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedGetSessionById = vi.mocked(getSessionById);

function stripsRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/strips", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/strips (integration, live local Supabase + Storage)", () => {
  let sessionId: string | null = null;
  let uploadedPath: string | null = null;

  beforeEach(() => {
    mockedCheckRateLimit.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    mockedCheckRateLimit.mockReset();

    if (uploadedPath) {
      await deleteStripImage(uploadedPath).catch(() => undefined);
      uploadedPath = null;
    }
    if (sessionId) {
      const supabase = createServiceRoleClient();
      await supabase.from("analytics_events").delete().eq("session_id", sessionId);
      await deleteSession(sessionId); // cascades to the strips row
      sessionId = null;
    }
  });

  it("returns 400 for an invalid body (missing imageDataUrl)", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "classic_bw",
        format: "3",
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an imageDataUrl exceeding the max length, before any Storage/DB work", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    // 8 * 1024 * 1024 + 1 chars of base64 body -- one over
    // createStripSchema's IMAGE_DATA_URL_MAX_LENGTH cap.
    const oversizedBody = "A".repeat(8 * 1024 * 1024 + 1);
    const oversizedDataUrl = `data:image/png;base64,${oversizedBody}`;

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "classic_bw",
        format: "3",
        imageDataUrl: oversizedDataUrl,
      })
    );

    expect(response.status).toBe(400);
    // Rejected at schema validation -- never reached the rate limiter or any
    // Storage/DB work.
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();

    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("strips")
      .select()
      .eq("session_id", session.id);
    if (error) throw new Error(error.message);
    expect(rows).toHaveLength(0);
  });

  it("returns 429 when the rate limiter denies the request", async () => {
    mockedCheckRateLimit.mockResolvedValue({ success: false });
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "classic_bw",
        format: "3",
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(429);

    // Nothing persisted for the rate-limited attempt.
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("strips")
      .select()
      .eq("session_id", session.id);
    if (error) throw new Error(error.message);
    expect(rows).toHaveLength(0);
  });

  it("keys the rate limiter by the request's client IP, at the 20/hour threshold", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const response = await POST(
      stripsRequest(
        {
          sessionId: session.id,
          stylePreset: "classic_bw",
          format: "3",
          imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
        },
        { "x-forwarded-for": "203.0.113.5, 70.41.3.18" }
      )
    );
    const body = await response.json();
    uploadedPath = `strips/${session.id}/${body.id}.png`;

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("203.0.113.5"),
      { limit: 20, windowSeconds: 60 * 60 }
    );
  });

  it("returns 400 for an unrecognized style preset", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "not_a_real_preset",
        format: "3",
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the session does not exist", async () => {
    const response = await POST(
      stripsRequest({
        sessionId: "00000000-0000-0000-0000-000000000000",
        stylePreset: "classic_bw",
        format: "3",
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when the submitted format doesn't match the session's actual format (format-smuggling guard)", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;
    expect(session.format).toBe("3"); // never upgraded

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "classic_bw",
        format: "4", // claims 4-photo despite the session never being upgraded
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(403);

    // Confirm nothing was persisted for the rejected attempt.
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("strips")
      .select()
      .eq("session_id", session.id);
    if (error) throw new Error(error.message);
    expect(rows).toHaveLength(0);
  });

  it("uploads the strip, persists storage_path (not a baked-in URL), and returns a working signed URL for format '3'", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "sepia",
        format: "3",
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.sessionId).toBe(session.id);
    expect(body.stylePreset).toBe("sepia");
    expect(typeof body.signedUrl).toBe("string");
    expect(body.signedUrl.length).toBeGreaterThan(0);

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
      .from("strips")
      .select()
      .eq("id", body.id)
      .single();
    if (error) throw new Error(error.message);

    expect(row.storage_path).toBe(`strips/${session.id}/${body.id}.png`);
    uploadedPath = row.storage_path;

    // Response never bakes a raw storage_path/public URL into the DB row's
    // exposed shape — only a freshly minted signed URL, and it's genuinely
    // fetchable.
    const fetched = await fetch(body.signedUrl);
    expect(fetched.status).toBe(200);

    // Phase 11: strip completion records a `strip_completed` analytics event.
    // This route has no Clerk auth requirement (Phase 9's resolved design),
    // so user_id is correctly null here.
    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select()
      .eq("session_id", session.id)
      .eq("event", "strip_completed");
    if (eventsError) throw new Error(eventsError.message);
    expect(events).toHaveLength(1);
    expect(events![0].user_id).toBeNull();
  });

  it("succeeds for format '4' once the session has actually been upgraded", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;
    await updateSessionFormat(session.id, "4");

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "vintage_warm",
        format: "4",
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    uploadedPath = `strips/${session.id}/${body.id}.png`;
  });

  it("returns 500 with the app's JSON error shape when an unexpected DB error is thrown", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;
    mockedGetSessionById.mockRejectedValueOnce(new Error("boom"));

    const response = await POST(
      stripsRequest({
        sessionId: session.id,
        stylePreset: "classic_bw",
        format: "3",
        imageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      })
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to create strip" });
  });
});
