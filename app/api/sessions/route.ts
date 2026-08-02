import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSessionSchema } from "@/lib/validation/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { createSession } from "@/lib/db/sessions";
import { addParticipant } from "@/lib/db/participants";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";
import { resolveClientIp } from "@/lib/http/clientIp";

// backend-schema.md §5: "e.g., 10 session creations/hour/IP" — cheap anti-abuse
// threshold for a free-tier deploy, not a hard product requirement.
const CREATE_SESSION_RATE_LIMIT = { limit: 10, windowSeconds: 60 * 60 };

// The session creator is always participant #1 (host), solo or invite — no
// display name is collected at creation time (createSessionSchema deliberately
// only accepts `mode`, see lib/validation/session.ts), so every session gets
// this default. Well within participants.display_name's 1-40 char check
// constraint (backend-schema §3.3 / lib/validation/participant.ts).
const DEFAULT_HOST_DISPLAY_NAME = "Host";

/**
 * POST /api/sessions — create a session (TRD §5).
 *
 * createSessionSchema -> checkRateLimit (IP-keyed) -> createSession -> insert
 * a host participants row -> { id, join_url }. Inserting the host
 * participant row here (not just on /join) closes the gap flagged in
 * implementation-plan Phase 1: solo sessions previously had no participant
 * row at all, which the /upgrade route's participant-authorization check
 * depends on.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clientIp = resolveClientIp(request);
  const { success } = await checkRateLimit(
    `sessions:create:${clientIp}`,
    CREATE_SESSION_RATE_LIMIT
  );
  if (!success) {
    return NextResponse.json(
      { error: "Too many sessions created recently. Please try again later." },
      { status: 429 }
    );
  }

  // Optional: if the creator happens to already have a Clerk session, record
  // them as the host (backend-schema §3.2 `host_user_id`). Session creation
  // itself never requires login (PRD functional requirement 1/5).
  const { userId: clerkId } = await auth();
  let hostUserId: string | null = null;
  if (clerkId) {
    const appUser = await getOrCreateByClerkId(clerkId);
    hostUserId = appUser.id;
  }

  const session = await createSession({ mode: parsed.data.mode, hostUserId });

  await addParticipant({
    sessionId: session.id,
    userId: hostUserId,
    displayName: DEFAULT_HOST_DISPLAY_NAME,
  });

  return NextResponse.json(
    {
      id: session.id,
      // Relative on purpose — no NEXT_PUBLIC_SITE_URL exists yet in this repo,
      // and the TRD §5 contract only requires the join/waiting entry point, not
      // a fully-qualified URL. Solo mode's own client ignores this and
      // navigates straight to /capture instead (flows.md §1a).
      join_url: `/session/${session.id}/waiting`,
    },
    { status: 201 }
  );
}
