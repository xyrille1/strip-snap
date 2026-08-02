import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { POST } from "./route";
import { createSession, deleteSession, getSessionById } from "@/lib/db/sessions";
import { addParticipant } from "@/lib/db/participants";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";
import { createServiceRoleClient } from "@/lib/supabase/server";

// The route only imports `auth` from this module, so mocking just that export
// is sufficient — no other Clerk export is exercised by this handler.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);

function upgradeRequest(sessionId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/sessions/${sessionId}/upgrade`,
    { method: "POST" }
  );
}

describe("POST /api/sessions/:id/upgrade (integration, live local Supabase, Clerk auth() mocked)", () => {
  let sessionId: string | null = null;
  let appUserId: string | null = null;

  afterEach(async () => {
    mockedAuth.mockReset();

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

  it("returns 401 when there is no authenticated Clerk session", async () => {
    mockedAuth.mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >);

    const created = await createSession({ mode: "invite", hostUserId: null });
    sessionId = created.id;

    const response = await POST(upgradeRequest(created.id), {
      params: { id: created.id },
    });

    expect(response.status).toBe(401);

    const persisted = await getSessionById(created.id);
    expect(persisted?.format).toBe("3");
  });

  it("returns 403 when the authenticated user is not a participant of the session", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    mockedAuth.mockResolvedValue({ userId: clerkId } as Awaited<
      ReturnType<typeof auth>
    >);

    const created = await createSession({ mode: "invite", hostUserId: null });
    sessionId = created.id;

    const response = await POST(upgradeRequest(created.id), {
      params: { id: created.id },
    });

    expect(response.status).toBe(403);

    const persisted = await getSessionById(created.id);
    expect(persisted?.format).toBe("3");

    // The route's getOrCreateByClerkId call creates an app_users row as a
    // side effect even when the participant check fails afterward — capture
    // its id so afterEach can clean it up.
    const appUser = await getOrCreateByClerkId(clerkId);
    appUserId = appUser.id;
  });

  it("returns 200 and upgrades format to 4 when the authenticated user is a participant", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    mockedAuth.mockResolvedValue({ userId: clerkId } as Awaited<
      ReturnType<typeof auth>
    >);

    const created = await createSession({ mode: "invite", hostUserId: null });
    sessionId = created.id;

    const appUser = await getOrCreateByClerkId(clerkId);
    appUserId = appUser.id;

    await addParticipant({
      sessionId: created.id,
      userId: appUser.id,
      displayName: "Test Participant",
    });

    const response = await POST(upgradeRequest(created.id), {
      params: { id: created.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.format).toBe("4");

    const persisted = await getSessionById(created.id);
    expect(persisted?.format).toBe("4");
  });
});
