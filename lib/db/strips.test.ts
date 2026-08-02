import { describe, it, expect, afterEach } from "vitest";
import { createStrip, getStripById } from "@/lib/db/strips";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { createServiceRoleClient } from "@/lib/supabase/server";

describe("lib/db/strips (integration, live local Supabase)", () => {
  let sessionId: string | null = null;

  afterEach(async () => {
    if (sessionId) {
      await deleteSession(sessionId); // cascades to strips (backend-schema §3.4)
      sessionId = null;
    }
  });

  it("creates a strip with a DB-assigned id and reads it back", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const created = await createStrip({
      sessionId: session.id,
      stylePreset: "classic_bw",
      storagePath: `strips/${session.id}/${crypto.randomUUID()}.png`,
    });

    expect(typeof created.id).toBe("string");
    expect(created.session_id).toBe(session.id);
    expect(created.style_preset).toBe("classic_bw");
    expect(created.storage_path).toContain(session.id);
    expect(created.created_at).not.toBeNull();

    const fetched = await getStripById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.session_id).toBe(session.id);
    expect(fetched?.storage_path).toBe(created.storage_path);
  });

  it("creates a strip with a caller-supplied id, matching the id used in its storage_path", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const stripId = crypto.randomUUID();
    const storagePath = `strips/${session.id}/${stripId}.png`;

    const created = await createStrip({
      id: stripId,
      sessionId: session.id,
      stylePreset: "sepia",
      storagePath,
    });

    expect(created.id).toBe(stripId);
    expect(created.storage_path).toBe(storagePath);

    const fetched = await getStripById(stripId);
    expect(fetched?.id).toBe(stripId);
  });

  it("returns null from getStripById for a strip that doesn't exist", async () => {
    const fetched = await getStripById("00000000-0000-0000-0000-000000000000");
    expect(fetched).toBeNull();
  });

  it("allows multiple strip rows per session (each participant uploads their own composited copy)", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const first = await createStrip({
      sessionId: session.id,
      stylePreset: "classic_bw",
      storagePath: `strips/${session.id}/${crypto.randomUUID()}.png`,
    });
    const second = await createStrip({
      sessionId: session.id,
      stylePreset: "high_contrast_mono",
      storagePath: `strips/${session.id}/${crypto.randomUUID()}.png`,
    });

    expect(first.id).not.toBe(second.id);

    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("strips")
      .select()
      .eq("session_id", session.id);
    if (error) throw new Error(error.message);

    expect(rows).toHaveLength(2);
  });

  it("deleting the owning session cascades to its strips", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const created = await createStrip({
      sessionId: session.id,
      stylePreset: "vintage_warm",
      storagePath: `strips/${session.id}/${crypto.randomUUID()}.png`,
    });

    await deleteSession(session.id);
    sessionId = null;

    const fetched = await getStripById(created.id);
    expect(fetched).toBeNull();
  });
});
