import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/:id/upgrade — logged-in participant upgrades the
 * session-wide format to 4-photo (TRD §5; one-logged-in-participant-unlocks
 * decision).
 * Real implementation (Step 4 Item 2): requires Clerk `auth()` (401 if
 * absent) -> sessionIdParamSchema -> appUsers.getOrCreateByClerkId ->
 * lib/db/sessions.ts#updateSessionFormat(id, '4'). No Clerk import yet —
 * @clerk/nextjs isn't installed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  void request;
  return NextResponse.json({ id: params.id, format: "4" }, { status: 501 });
}
