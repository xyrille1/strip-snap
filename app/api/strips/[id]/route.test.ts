import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { GET } from "./route";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { createStrip } from "@/lib/db/strips";
import { uploadStripImage, deleteStripImage } from "@/lib/storage";

// checkRateLimit fails open when Upstash isn't configured (always true) —
// mocking it directly is the only way to exercise the 429 path without a
// live Redis instance. Mirrors app/api/strips/route.test.ts's pattern.
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function stripRequest(
  id: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost/api/strips/${id}`, {
    method: "GET",
    headers,
  });
}

describe("GET /api/strips/:id (integration, live local Supabase + Storage)", () => {
  let sessionId: string | null = null;
  let storagePath: string | null = null;

  beforeEach(() => {
    mockedCheckRateLimit.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    mockedCheckRateLimit.mockReset();

    if (storagePath) {
      await deleteStripImage(storagePath).catch(() => undefined);
      storagePath = null;
    }
    if (sessionId) {
      await deleteSession(sessionId); // cascades to the strips row
      sessionId = null;
    }
  });

  it("returns 400 for a malformed strip id", async () => {
    const response = await GET(stripRequest("not-a-uuid"), {
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the strip does not exist", async () => {
    const response = await GET(
      stripRequest("00000000-0000-0000-0000-000000000000"),
      { params: { id: "00000000-0000-0000-0000-000000000000" } }
    );

    expect(response.status).toBe(404);
  });

  it("mints a fresh, working signed URL on every call rather than caching one (S-03)", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const stripId = crypto.randomUUID();
    storagePath = `strips/${session.id}/${stripId}.png`;
    await uploadStripImage(storagePath, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));
    const strip = await createStrip({
      id: stripId,
      sessionId: session.id,
      stylePreset: "classic_bw",
      storagePath,
    });

    const firstResponse = await GET(stripRequest(strip.id), {
      params: { id: strip.id },
    });
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    expect(firstBody.id).toBe(strip.id);
    expect(firstBody.sessionId).toBe(session.id);
    expect(firstBody.stylePreset).toBe("classic_bw");
    expect(typeof firstBody.signedUrl).toBe("string");

    const firstFetch = await fetch(firstBody.signedUrl);
    expect(firstFetch.status).toBe(200);

    // A second call independently mints its own signed URL (never reused
    // from the first response) and that URL independently works too — this
    // is the mechanism that makes "two calls after an earlier URL's expiry
    // both succeed" (S-03) possible: nothing is cached between calls.
    const secondResponse = await GET(stripRequest(strip.id), {
      params: { id: strip.id },
    });
    expect(secondResponse.status).toBe(200);
    const secondBody = await secondResponse.json();
    expect(typeof secondBody.signedUrl).toBe("string");

    const secondFetch = await fetch(secondBody.signedUrl);
    expect(secondFetch.status).toBe(200);
  });

  it("returns 429 when the rate limiter denies the request", async () => {
    mockedCheckRateLimit.mockResolvedValue({ success: false });

    const response = await GET(
      stripRequest("00000000-0000-0000-0000-000000000000"),
      { params: { id: "00000000-0000-0000-0000-000000000000" } }
    );

    expect(response.status).toBe(429);
  });

  it("keys the rate limiter by the request's client IP", async () => {
    await GET(
      stripRequest("00000000-0000-0000-0000-000000000000", {
        "x-forwarded-for": "203.0.113.5, 70.41.3.18",
      }),
      { params: { id: "00000000-0000-0000-0000-000000000000" } }
    );

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("203.0.113.5"),
      { limit: 60, windowSeconds: 60 * 60 }
    );
  });
});
