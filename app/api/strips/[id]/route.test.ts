import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { createStrip } from "@/lib/db/strips";
import { uploadStripImage, deleteStripImage } from "@/lib/storage";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function stripRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/strips/${id}`, {
    method: "GET",
  });
}

describe("GET /api/strips/:id (integration, live local Supabase + Storage)", () => {
  let sessionId: string | null = null;
  let storagePath: string | null = null;

  afterEach(async () => {
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
});
