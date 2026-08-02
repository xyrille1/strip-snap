import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createSession, deleteSession, updateSessionFormat } from "@/lib/db/sessions";
import { deleteStripImage } from "@/lib/storage";
import { createServiceRoleClient } from "@/lib/supabase/server";

// A minimal valid 1x1 transparent PNG, base64-encoded (same fixture as
// lib/storage.test.ts) — real image bytes so the upload path exercises
// actual Storage content handling, not a text placeholder.
const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function stripsRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/strips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/strips (integration, live local Supabase + Storage)", () => {
  let sessionId: string | null = null;
  let uploadedPath: string | null = null;

  afterEach(async () => {
    if (uploadedPath) {
      await deleteStripImage(uploadedPath).catch(() => undefined);
      uploadedPath = null;
    }
    if (sessionId) {
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
});
