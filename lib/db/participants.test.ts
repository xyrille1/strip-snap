import { describe, it, expect, afterEach } from "vitest";
import {
  addParticipant,
  getParticipantsForSession,
  getParticipantByUserAndSession,
  updateParticipantStatus,
  UniqueParticipantError,
} from "@/lib/db/participants";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { createServiceRoleClient } from "@/lib/supabase/server";

describe("lib/db/participants (integration, live local Supabase)", () => {
  let sessionId: string | null = null;
  let appUserId: string | null = null;

  afterEach(async () => {
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

  it("adds an anonymous participant (user_id null) and reads it back", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const participant = await addParticipant({
      sessionId: session.id,
      userId: null,
      displayName: "Anon Guest",
    });

    expect(participant.session_id).toBe(session.id);
    expect(participant.user_id).toBeNull();
    expect(participant.display_name).toBe("Anon Guest");
    expect(participant.status).toBe("connected");

    const all = await getParticipantsForSession(session.id);
    expect(all).toHaveLength(1);
  });

  it("allows multiple anonymous participants in the same session (unique constraint exempts null user_id)", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    await addParticipant({ sessionId: session.id, userId: null, displayName: "Guest 1" });
    await addParticipant({ sessionId: session.id, userId: null, displayName: "Guest 2" });

    const all = await getParticipantsForSession(session.id);
    expect(all).toHaveLength(2);
  });

  it("throws UniqueParticipantError when a logged-in user double-joins the same session", async () => {
    const supabase = createServiceRoleClient();
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    const { data: appUser, error } = await supabase
      .from("app_users")
      .insert({ clerk_id: clerkId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    appUserId = appUser.id;

    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const first = await addParticipant({
      sessionId: session.id,
      userId: appUser.id,
      displayName: "Signed-in Guest",
    });
    expect(first.user_id).toBe(appUser.id);

    const rejoinAttempt = addParticipant({
      sessionId: session.id,
      userId: appUser.id,
      displayName: "Signed-in Guest (again)",
    });

    // Belt-and-suspenders: toBeInstanceOf catches the case where
    // UniqueParticipantError silently resolved to `undefined` at import time
    // (which would make a bare `.toThrow(UniqueParticipantError)` a false
    // pass, since `.toThrow(undefined)` just checks "threw something").
    await expect(rejoinAttempt).rejects.toBeInstanceOf(UniqueParticipantError);
    await expect(rejoinAttempt).rejects.toThrow(UniqueParticipantError);

    const all = await getParticipantsForSession(session.id);
    expect(all).toHaveLength(1);
  });

  it("getParticipantByUserAndSession finds the existing row for a re-joining user, and null for a stranger", async () => {
    const supabase = createServiceRoleClient();
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    const { data: appUser, error } = await supabase
      .from("app_users")
      .insert({ clerk_id: clerkId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    appUserId = appUser.id;

    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const created = await addParticipant({
      sessionId: session.id,
      userId: appUser.id,
      displayName: "Signed-in Guest",
    });

    const found = await getParticipantByUserAndSession(session.id, appUser.id);
    expect(found?.id).toBe(created.id);

    const notFound = await getParticipantByUserAndSession(
      session.id,
      "00000000-0000-0000-0000-000000000000"
    );
    expect(notFound).toBeNull();
  });

  it("updateParticipantStatus updates and returns the row", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;

    const created = await addParticipant({
      sessionId: session.id,
      userId: null,
      displayName: "Guest",
    });
    expect(created.status).toBe("connected");

    const updated = await updateParticipantStatus(created.id, "ready");
    expect(updated.status).toBe("ready");
  });
});
