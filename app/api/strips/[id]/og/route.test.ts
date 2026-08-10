import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { createStrip } from "@/lib/db/strips";
import { uploadStripImage, deleteStripImage } from "@/lib/storage";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function ogRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/strips/${id}/og`, {
    method: "GET",
  });
}

describe("GET /api/strips/:id/og (integration, live local Supabase + Storage)", () => {
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
    const response = await GET(ogRequest("not-a-uuid"), {
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the strip does not exist", async () => {
    const response = await GET(
      ogRequest("00000000-0000-0000-0000-000000000000"),
      { params: { id: "00000000-0000-0000-0000-000000000000" } }
    );

    expect(response.status).toBe(404);
  });

  it("redirects (3xx) to a fresh, working signed URL", async () => {
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

    const response = await GET(ogRequest(strip.id), {
      params: { id: strip.id },
    });

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location");
    expect(typeof location).toBe("string");

    const fetched = await fetch(location!);
    expect(fetched.status).toBe(200);
  });
});
