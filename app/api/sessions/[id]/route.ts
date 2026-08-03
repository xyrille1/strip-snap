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
 *
 * `dynamic = "force-dynamic"` (same reasoning as app/api/time/route.ts):
 * without it, Next.js can statically optimize/cache this handler, which
 * would freeze the participant list at build/deploy time instead of
 * reflecting who has actually joined — breaking the waiting room and every
 * poller relying on fresh participant state.
 *
 * `fetchCache = "force-no-store"` is ALSO required — `getSessionById`/
 * `getParticipantsForSession` go through `supabase-js`, which calls the
 * platform `fetch()` under the hood to talk to PostgREST. Next.js's Data
 * Cache intercepts that `fetch()` independently of route-level `dynamic`
 * rendering; verified empirically in dev that `dynamic = "force-dynamic"`
 * alone still served a stale participant list after a real join (the
 * handler re-ran each request — confirmed via per-request log timing — but
 * the inner `fetch()` result was served from cache regardless).
 * `fetchCache = "force-no-store"` forces every fetch in this route to
 * bypass the Data Cache regardless of the call site's own cache option.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
