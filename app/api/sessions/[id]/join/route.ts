import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/:id/join — join via invite link (TRD §5).
 * Real implementation (Step 4 Item 4): joinSessionSchema -> checkRateLimit ->
 * lib/db/participants.ts#addParticipant -> mint the per-participant Realtime
 * Authorization JWT (SUPABASE_JWT_SECRET, via `jose`) for lib/realtime.ts#setRealtimeAuth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  void request;
  return NextResponse.json(
    {
      participant: {
        id: "00000000-0000-0000-0000-000000000000",
        sessionId: params.id,
        displayName: "",
        status: "connected",
      },
      realtimeToken: "",
    },
    { status: 501 }
  );
}
