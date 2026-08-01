import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sessionIdParamSchema } from "@/lib/validation/session";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";
import { getSessionById, updateSessionFormat } from "@/lib/db/sessions";

/**
 * POST /api/sessions/:id/upgrade — a logged-in participant upgrades the
 * session-wide format to 4-photo (TRD §5; backend-schema §3.2/§3.3
 * one-logged-in-participant-unlocks-for-the-whole-session decision).
 *
 * Auth is verified server-side via Clerk's `auth()` — never trust a
 * client-supplied user id (backend-schema §5). No redirect on missing auth:
 * F-21/F-22 require an inline sign-in prompt mid-flow, so this returns a
 * plain 401 JSON body for the client to react to.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  void request;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in required to upgrade to the 4-photo format" },
      { status: 401 }
    );
  }

  const parsed = sessionIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session id" },
      { status: 400 }
    );
  }

  const existing = await getSessionById(parsed.data.id);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await getOrCreateByClerkId(userId);

  const session = await updateSessionFormat(parsed.data.id, "4");

  return NextResponse.json(session, { status: 200 });
}
