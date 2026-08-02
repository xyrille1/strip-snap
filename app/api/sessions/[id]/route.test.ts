import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createSession, deleteSession } from "@/lib/db/sessions";
import { addParticipant } from "@/lib/db/participants";

function sessionRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${id}`, {
    method: "GET",
  });
}

describe("GET /api/sessions/:id (integration, live local Supabase)", () => {
  let sessionId: string | null = null;

  afterEach(async () => {
    if (sessionId) {
      await deleteSession(sessionId);
      sessionId = null;
    }
  });

  it("returns 400 for a malformed session id", async () => {
    const response = await GET(sessionRequest("not-a-uuid"), {
      params: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the session does not exist", async () => {
    const response = await GET(
      sessionRequest("00000000-0000-0000-0000-000000000000"),
      { params: { id: "00000000-0000-0000-0000-000000000000" } }
    );

    expect(response.status).toBe(404);
  });

  it("returns the session and an empty participants array for a session with no participants", async () => {
    const session = await createSession({ mode: "solo", hostUserId: null });
    sessionId = session.id;

    const response = await GET(sessionRequest(session.id), {
      params: { id: session.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.id).toBe(session.id);
    expect(body.session.mode).toBe("solo");
    expect(body.session.status).toBe("waiting");
    expect(body.participants).toEqual([]);
  });

  it("returns all participants for the session", async () => {
    const session = await createSession({ mode: "invite", hostUserId: null });
    sessionId = session.id;
    await addParticipant({
      sessionId: session.id,
      userId: null,
      displayName: "Host",
    });
    await addParticipant({
      sessionId: session.id,
      userId: null,
      displayName: "Guest",
    });

    const response = await GET(sessionRequest(session.id), {
      params: { id: session.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.participants).toHaveLength(2);
    const names = body.participants.map(
      (p: { display_name: string }) => p.display_name
    );
    expect(names.sort()).toEqual(["Guest", "Host"]);
  });
});
