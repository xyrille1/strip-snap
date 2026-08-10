import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { sessionIdParamSchema } from "@/lib/validation/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";
import { getParticipantByUserAndSession } from "@/lib/db/participants";
import { getSessionById, updateSessionFormat } from "@/lib/db/sessions";

// Rare, once-per-session action for a real signed-in user — generous
// relative to the anonymous-route limits (sessions/route.ts's 10/hour,
// join's 30/hour) since it's keyed per-user, not per-IP, and there's no
// NAT-sharing concern to size around.
const UPGRADE_SESSION_RATE_LIMIT = { limit: 10, windowSeconds: 60 * 60 };

/**
 * POST /api/sessions/:id/upgrade — a logged-in participant upgrades the
 * session-wide format to 4-photo (TRD §5; backend-schema §3.2/§3.3
 * one-logged-in-participant-unlocks-for-the-whole-session decision).
 *
 * Auth is verified server-side via Clerk's `auth()` — never trust a
 * client-supplied user id (backend-schema §5). No redirect on missing auth:
 * F-21/F-22 require an inline sign-in prompt mid-flow, so this returns a
 * plain 401 JSON body for the client to react to.
 *
 * Being authenticated is not sufficient on its own — the acting user must
 * also be a participant of *this* session, otherwise any logged-in user
 * could upgrade a session they were never invited to. That check returns
 * 403 (authenticated but not authorized), distinct from the 401 above.
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

  const { success } = await checkRateLimit(
    `sessions:upgrade:${userId}`,
    UPGRADE_SESSION_RATE_LIMIT
  );
  if (!success) {
    return NextResponse.json(
      { error: "Too many upgrade attempts recently. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const existing = await getSessionById(parsed.data.id);
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const appUser = await getOrCreateByClerkId(userId);

    const participant = await getParticipantByUserAndSession(
      parsed.data.id,
      appUser.id
    );
    if (!participant) {
      return NextResponse.json(
        { error: "You must be a participant of this session to upgrade it" },
        { status: 403 }
      );
    }

    const session = await updateSessionFormat(parsed.data.id, "4");

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "api", route: "sessions:upgrade" } });
    return NextResponse.json(
      { error: "Failed to upgrade session format" },
      { status: 500 }
    );
  }
}
