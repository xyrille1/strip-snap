import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sessions/:id — fetch session + participant state (TRD §5).
 * Real implementation (Step 4 Item 4): sessionIdParamSchema ->
 * lib/db/sessions.ts#getSessionById + lib/db/participants.ts#getParticipantsForSession.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  void request;
  return NextResponse.json(
    {
      session: {
        id: params.id,
        mode: "solo",
        format: "3",
        status: "waiting",
        createdAt: new Date(0).toISOString(),
        expiresAt: new Date(0).toISOString(),
      },
      participants: [],
    },
    { status: 501 }
  );
}
