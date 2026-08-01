import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions — create a session (TRD §5).
 * Real implementation (Step 4 Item 3): createSessionSchema -> checkRateLimit
 * on IP -> lib/db/sessions.ts#createSession -> { id, join_url }.
 */
export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      id: "00000000-0000-0000-0000-000000000000",
      join_url:
        "https://example.com/session/00000000-0000-0000-0000-000000000000/waiting",
    },
    { status: 501 }
  );
}
