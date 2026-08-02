import { NextResponse } from "next/server";

/**
 * GET /api/time — trivial authoritative server clock reading.
 *
 * New minimal API surface beyond TRD §5's documented endpoint list (flagged
 * per implementation-plan Phase 6): the countdown-election flow
 * (lib/countdownSync.ts) needs an authoritative `now` reading before
 * broadcasting `countdown_start`, and every receiving client needs one too,
 * to compute its own clock offset against the server (TRD §3's hard
 * requirement — capture must be scheduled off a server-fetched timestamp,
 * never client-local time or broadcast-receipt time). No auth, no
 * validation, no request body — it returns nothing but a timestamp, so
 * there's nothing here for RLS/auth to gate.
 *
 * `dynamic = "force-dynamic"` + `Cache-Control: no-store` are both load-
 * bearing, not defensive boilerplate: Next.js can statically optimize (and
 * cache) a route handler with no dynamic inputs, which for this route would
 * mean silently freezing `Date.now()` at build/deploy time and serving that
 * same stale value forever — exactly the kind of bug this route exists to
 * prevent elsewhere in the app.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { now: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
