import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/strips — upload the composited strip (TRD §5).
 * Real implementation (Step 4 Item 8): createStripSchema + a server-side
 * check that the submitted photo count matches sessions.format (closes the
 * format-smuggling vector) -> lib/db/strips.ts#createStrip, storing the
 * Storage object path (not a public URL — see backend-schema §3.4) under a
 * pattern like `strips/{session_id}/{strip_id}.png`.
 */
export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      id: "00000000-0000-0000-0000-000000000000",
      sessionId: "00000000-0000-0000-0000-000000000000",
      stylePreset: "classic_bw",
      signedUrl: "",
    },
    { status: 501 }
  );
}
