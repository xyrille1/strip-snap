import "server-only";
import { SignJWT } from "jose";

/**
 * Mints the short-lived per-participant JWT that authorizes a client to
 * subscribe (presence + broadcast) to the `session:{sessionId}` Supabase
 * Realtime channel — see docs/online-photobooth-trd.md §5's channel naming
 * and docs/online-photobooth-backend-schema.md §4's Realtime Authorization
 * note.
 *
 * This is intentionally short-lived (30 minutes): Realtime disconnects the
 * client once the token expires, and a later phase is responsible for
 * re-minting it well before that — this phase only mints and returns the
 * token from `POST /api/sessions/:id/join`.
 *
 * Signed with SUPABASE_JWT_SECRET (HS256) — the same secret Supabase's own
 * Realtime server verifies connection JWTs against for "custom/third-party
 * JWT" auth, per Supabase's documented pattern for participants who are not
 * themselves Supabase Auth users (photobooth participants are Clerk users or
 * fully anonymous). Server-side only (`server-only`): this must never run in
 * a client component, since SUPABASE_JWT_SECRET must never reach the browser.
 */
const REALTIME_TOKEN_TTL_SECONDS = 30 * 60;

export async function mintRealtimeToken(
  sessionId: string,
  participantId: string
): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not set — cannot mint a Realtime Authorization token."
    );
  }

  const encodedSecret = new TextEncoder().encode(secret);
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({
    role: "authenticated",
    topic: `session:${sessionId}`,
    session_id: sessionId,
    participant_id: participantId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + REALTIME_TOKEN_TTL_SECONDS)
    .sign(encodedSecret);
}
