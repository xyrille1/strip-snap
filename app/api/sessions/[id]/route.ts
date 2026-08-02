import { NextRequest, NextResponse } from "next/server";
import { sessionIdParamSchema } from "@/lib/validation/session";
import { getSessionById } from "@/lib/db/sessions";
import { getParticipantsForSession } from "@/lib/db/participants";

/**
 * GET /api/sessions/:id — fetch session + participant state (TRD §5).
 *
 * sessionIdParamSchema -> getSessionById (404 if missing) ->
 * getParticipantsForSession -> { session, participants }.
 *
 * No auth required — matches join/route.ts's posture that joining/viewing a
 * session never requires login (PRD/TRD), and the waiting room needs this
 * for anonymous participants too. The session/participant ids themselves are
 * the access-control mechanism (backend-schema §1.3, UUIDv4, non-guessable).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  void request;

  const parsed = sessionIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await getSessionById(parsed.data.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const participants = await getParticipantsForSession(session.id);

  return NextResponse.json({ session, participants }, { status: 200 });
}
