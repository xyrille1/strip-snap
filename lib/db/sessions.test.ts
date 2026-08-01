import { describe, it, expect, afterEach } from "vitest";
import {
  createSession,
  getSessionById,
  updateSessionStatus,
  markSessionCompleted,
  deleteSession,
} from "@/lib/db/sessions";

describe("lib/db/sessions (integration, live local Supabase)", () => {
  let createdId: string | null = null;

  afterEach(async () => {
    if (createdId) {
      await deleteSession(createdId);
      createdId = null;
    }
  });

  it("creates, reads, updates status, completes, and deletes a session", async () => {
    const created = await createSession({ mode: "solo", hostUserId: null });
    createdId = created.id;

    expect(created.mode).toBe("solo");
    expect(created.format).toBe("3");
    expect(created.status).toBe("waiting");
    expect(created.host_user_id).toBeNull();
    expect(created.completed_at).toBeNull();

    const fetched = await getSessionById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);

    const counting = await updateSessionStatus(created.id, "counting");
    expect(counting.status).toBe("counting");

    const completed = await markSessionCompleted(created.id);
    expect(completed.status).toBe("done");
    expect(completed.completed_at).not.toBeNull();

    await deleteSession(created.id);
    createdId = null;

    const afterDelete = await getSessionById(created.id);
    expect(afterDelete).toBeNull();
  });
});
