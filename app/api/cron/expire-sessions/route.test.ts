import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createSession, deleteSession, getSessionById } from "@/lib/db/sessions";
import { createStrip, getStripById } from "@/lib/db/strips";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { uploadStripImage, mintSignedStripUrl, deleteStripImage } from "@/lib/storage";

const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  throw new Error(
    "CRON_SECRET must be set in .env.local for this test to run meaningfully"
  );
}

// A minimal valid 1x1 transparent PNG, base64-encoded.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function cronRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/expire-sessions", {
    method: "GET",
    headers,
  });
}

async function setExpiresAt(id: string, date: Date): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("sessions")
    .update({ expires_at: date.toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function setStatus(
  id: string,
  status: "waiting" | "counting" | "capturing" | "done" | "expired"
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

describe("GET /api/cron/expire-sessions (integration, live local Supabase)", () => {
  const sessionIdsToCleanUp: string[] = [];
  const storagePathsToCleanUp: string[] = [];

  afterEach(async () => {
    for (const path of storagePathsToCleanUp) {
      await deleteStripImage(path).catch(() => undefined);
    }
    storagePathsToCleanUp.length = 0;
    for (const id of sessionIdsToCleanUp) {
      // Session may already have been deleted by the route itself -- ignore
      // failures, this is best-effort cleanup for sessions that survived.
      await deleteSession(id).catch(() => undefined);
    }
    sessionIdsToCleanUp.length = 0;
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

  it("Phase A: marks a past-TTL, non-expired session as 'expired', and does NOT delete it in the same pass", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionIdsToCleanUp.push(session.id);
    await setExpiresAt(session.id, new Date(Date.now() - 60_000));

    const response = await GET(
      cronRequest({ authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expired).toBeGreaterThanOrEqual(1);

    const persisted = await getSessionById(session.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("expired");
  });

  it("Phase B: does NOT delete an 'expired' session whose expires_at is within the delete buffer", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionIdsToCleanUp.push(session.id);
    await setExpiresAt(session.id, new Date(Date.now() - 5 * 60 * 1000)); // 5 min ago
    await setStatus(session.id, "expired");

    await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));

    const persisted = await getSessionById(session.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("expired");
  });

  it("Phase B: deletes an 'expired' session past the delete buffer, its strip row, and its Storage object", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionIdsToCleanUp.push(session.id);
    await setExpiresAt(session.id, new Date(Date.now() - 2 * 60 * 60 * 1000)); // 2h ago
    await setStatus(session.id, "expired");

    const stripId = crypto.randomUUID();
    const storagePath = `strips/${session.id}/${stripId}.png`;
    storagePathsToCleanUp.push(storagePath);
    const pngBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
    await uploadStripImage(storagePath, pngBytes);
    const strip = await createStrip({
      id: stripId,
      sessionId: session.id,
      stylePreset: "classic_bw",
      storagePath,
    });

    // Confirm the Storage object is actually there before the sweep, so the
    // post-sweep assertion proves something changed.
    const signedUrlBefore = await mintSignedStripUrl(storagePath, 60);
    const beforeResponse = await fetch(signedUrlBefore);
    expect(beforeResponse.status).toBe(200);

    const response = await GET(
      cronRequest({ authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBeGreaterThanOrEqual(1);

    // Session row gone.
    const persistedSession = await getSessionById(session.id);
    expect(persistedSession).toBeNull();

    // Strip row gone (cascade).
    const persistedStrip = await getStripById(strip.id);
    expect(persistedStrip).toBeNull();

    // Storage object actually gone -- not just the DB rows. Re-fetch the
    // SAME signed URL minted before the sweep (still within its 60s expiry)
    // and confirm it no longer serves bytes. (Minting a brand-new signed URL
    // for an already-deleted path errors out at sign time in local Supabase
    // Storage -- see lib/storage.test.ts's equivalent assertion, which
    // reuses the pre-deletion URL for the same reason.)
    const afterResponse = await fetch(signedUrlBefore);
    expect(afterResponse.status).not.toBe(200);
  });
});
