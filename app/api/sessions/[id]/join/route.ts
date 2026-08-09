import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { joinSessionSchema } from "@/lib/validation/participant";
import { sessionIdParamSchema } from "@/lib/validation/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { resolveClientIp } from "@/lib/http/clientIp";
import { getSessionById } from "@/lib/db/sessions";
import {
  addParticipant,
  getParticipantByUserAndSession,
  renameAnonymousParticipant,
  UniqueParticipantError,
} from "@/lib/db/participants";
import { getOrCreateByClerkId } from "@/lib/db/appUsers";
import { mintRealtimeToken } from "@/lib/realtimeAuth";
import type { Database } from "@/lib/supabase/types";

type ParticipantRow = Database["public"]["Tables"]["participants"]["Row"];

// backend-schema.md §5's "10 session creations/hour/IP" is the documented example threshold;
// joining is a lighter-weight action than creating, but shares the same free-tier anti-abuse
// intent (TRD §5, /join). Kept generous relative to creation since a single invite session
// legitimately has multiple participants joining from the same NAT'd IP in quick succession.
const JOIN_SESSION_RATE_LIMIT = { limit: 30, windowSeconds: 60 * 60 };

/**
 * POST /api/sessions/:id/join — join via invite link (TRD §5).
 *
 * joinSessionSchema -> checkRateLimit -> confirm session exists -> resolve optional Clerk
 * userId (joining never requires login) -> addParticipant (gracefully handling the
 * `unique(session_id, user_id)` re-join case, backend-schema §3.3) -> mintRealtimeToken
 * (lib/realtimeAuth.ts) -> { participant, realtimeToken }.
 *
 * Status code convention: 201 for a brand-new participant row, 200 when an already-joined
 * logged-in user re-joins (or an anonymous caller with a stored `participantId` gets their
 * existing row renamed — see `renameAnonymousParticipant`'s doc comment) and gets back their
 * existing row plus a freshly minted token. Anonymous participants (`user_id: null`) are
 * exempt from the unique constraint per backend-schema §3.3, so a first-time anonymous join
 * (no `participantId`) always creates a new row (201).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const parsedParams = sessionIdParamSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = joinSessionSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clientIp = resolveClientIp(request);
  const { success } = await checkRateLimit(
    `sessions:join:${clientIp}`,
    JOIN_SESSION_RATE_LIMIT
  );
  if (!success) {
    return NextResponse.json(
      { error: "Too many join attempts recently. Please try again later." },
      { status: 429 }
    );
  }

  const session = await getSessionById(parsedParams.data.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Joining never requires login (PRD/TRD — login only gates the 4-photo upgrade). If the
  // joiner happens to have a Clerk session, record them so the unique(session_id, user_id)
  // constraint and re-join handling below can apply.
  const { userId: clerkId } = await auth();
  let appUserId: string | null = null;
  if (clerkId) {
    const appUser = await getOrCreateByClerkId(clerkId);
    appUserId = appUser.id;
  }

  let participant: ParticipantRow;
  let isNewJoin = true;

  if (appUserId) {
    const existing = await getParticipantByUserAndSession(session.id, appUserId);
    if (existing) {
      participant = existing;
      isNewJoin = false;
    } else {
      try {
        participant = await addParticipant({
          sessionId: session.id,
          userId: appUserId,
          displayName: parsedBody.data.displayName,
        });
      } catch (err) {
        // Race fallback: two concurrent join requests for the same logged-in user both pass
        // the `existing` check above, then one insert wins and the other hits the unique
        // constraint. Re-fetch and return the row the winning request created instead of 500ing.
        if (err instanceof UniqueParticipantError) {
          const winner = await getParticipantByUserAndSession(session.id, appUserId);
          if (!winner) throw err;
          participant = winner;
          isNewJoin = false;
        } else {
          throw err;
        }
      }
    }
  } else {
    // Anonymous participants are exempt from the unique constraint
    // (backend-schema §3.3). If this client already has a stored identity
    // for this session (`participantId` — most often the session creator's
    // own `Host` row from `POST /api/sessions`, see
    // lib/db/participants.ts#renameAnonymousParticipant's doc comment),
    // rename that row in place instead of creating a second, disconnected
    // one for the same physical person. Falls back to a fresh row when no
    // `participantId` was sent, or it didn't match anything renameable —
    // the pre-existing behavior for a genuine first-time joiner.
    const renamed = parsedBody.data.participantId
      ? await renameAnonymousParticipant(
          session.id,
          parsedBody.data.participantId,
          parsedBody.data.displayName
        )
      : null;

    if (renamed) {
      participant = renamed;
      isNewJoin = false;
    } else {
      participant = await addParticipant({
        sessionId: session.id,
        userId: null,
        displayName: parsedBody.data.displayName,
      });
    }
  }

  const realtimeToken = await mintRealtimeToken(session.id, participant.id);

  return NextResponse.json(
    { participant, realtimeToken },
    { status: isNewJoin ? 201 : 200 }
  );
}
