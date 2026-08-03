import { describe, it, expect, afterEach } from "vitest";
import {
  createSession,
  getSessionById,
  updateSessionStatus,
  updateSessionFormat,
  markSessionCompleted,
  deleteSession,
  getExpiredSessions,
  expireSession,
  getSessionsPendingDeletion,
} from "@/lib/db/sessions";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Directly sets a session's `expires_at` — used to simulate TTL expiry without waiting real time. */
async function setExpiresAt(id: string, date: Date): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("sessions")
    .update({ expires_at: date.toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

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

  it("upgrades a session's format from 3 to 4, and can be set back to 3", async () => {
    const created = await createSession({ mode: "invite", hostUserId: null });
    createdId = created.id;

    expect(created.format).toBe("3");

    const upgraded = await updateSessionFormat(created.id, "4");
    expect(upgraded.id).toBe(created.id);
    expect(upgraded.format).toBe("4");

    const persisted = await getSessionById(created.id);
    expect(persisted?.format).toBe("4");

    const reverted = await updateSessionFormat(created.id, "3");
    expect(reverted.format).toBe("3");
  });

  it("stores a non-null host_user_id when the creator is a known app_users row", async () => {
    const supabase = createServiceRoleClient();
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .insert({ clerk_id: clerkId })
      .select()
      .single();
    if (appUserError) throw new Error(appUserError.message);

    try {
      const created = await createSession({
        mode: "solo",
        hostUserId: appUser.id,
      });
      createdId = created.id;

      expect(created.host_user_id).toBe(appUser.id);

      const persisted = await getSessionById(created.id);
      expect(persisted?.host_user_id).toBe(appUser.id);
    } finally {
      await supabase.from("app_users").delete().eq("id", appUser.id);
    }
  });

  it("getExpiredSessions returns sessions past expires_at that aren't yet 'expired', and excludes ones that are still in the future", async () => {
    const past = await createSession({ mode: "solo", hostUserId: null });
    const future = await createSession({ mode: "solo", hostUserId: null });
    try {
      await setExpiresAt(past.id, new Date(Date.now() - 60_000));

      const expired = await getExpiredSessions();
      const ids = expired.map((s) => s.id);
      expect(ids).toContain(past.id);
      expect(ids).not.toContain(future.id);
    } finally {
      await deleteSession(past.id);
      await deleteSession(future.id);
    }
  });

  it("getExpiredSessions excludes sessions already marked status = 'expired'", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    try {
      await setExpiresAt(session.id, new Date(Date.now() - 60_000));
      await expireSession(session.id);

      const expired = await getExpiredSessions();
      expect(expired.map((s) => s.id)).not.toContain(session.id);
    } finally {
      await deleteSession(session.id);
    }
  });

  it("expireSession sets status to 'expired' and persists it", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    try {
      const updated = await expireSession(session.id);
      expect(updated.status).toBe("expired");

      const persisted = await getSessionById(session.id);
      expect(persisted?.status).toBe("expired");
    } finally {
      await deleteSession(session.id);
    }
  });

  it("getSessionsPendingDeletion returns 'expired' sessions whose expires_at is older than the buffer, excluding ones expired more recently than the buffer", async () => {
    const oldExpired = await createSession({ mode: "solo", hostUserId: null });
    const recentlyExpired = await createSession({
      mode: "solo",
      hostUserId: null,
    });
    try {
      await setExpiresAt(
        oldExpired.id,
        new Date(Date.now() - 2 * 60 * 60 * 1000) // 2h ago
      );
      await setExpiresAt(
        recentlyExpired.id,
        new Date(Date.now() - 5 * 60 * 1000) // 5min ago
      );
      await expireSession(oldExpired.id);
      await expireSession(recentlyExpired.id);

      const pending = await getSessionsPendingDeletion(60 * 60 * 1000); // 1h buffer
      const ids = pending.map((s) => s.id);
      expect(ids).toContain(oldExpired.id);
      expect(ids).not.toContain(recentlyExpired.id);
    } finally {
      await deleteSession(oldExpired.id);
      await deleteSession(recentlyExpired.id);
    }
  });

  it("getSessionsPendingDeletion excludes sessions that are not status = 'expired', even if expires_at is far in the past", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    try {
      await setExpiresAt(session.id, new Date(Date.now() - 2 * 60 * 60 * 1000));
      // status is left at its default 'waiting' -- never marked expired.

      const pending = await getSessionsPendingDeletion(60 * 60 * 1000);
      expect(pending.map((s) => s.id)).not.toContain(session.id);
    } finally {
      await deleteSession(session.id);
    }
  });
});
