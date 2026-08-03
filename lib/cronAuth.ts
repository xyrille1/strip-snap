import { NextRequest, NextResponse } from "next/server";

/**
 * Verifies the `Authorization: Bearer $CRON_SECRET` header that Vercel Cron
 * (and any manual/test caller) must present to invoke a cron route, per
 * Vercel's standard convention. Shared by app/api/cron/daily-metrics and
 * app/api/cron/expire-sessions.
 *
 * Note: `CRON_SECRET` is referenced by both cron route stubs but is not
 * listed in ops-runbook.md §2's env var table -- same category of doc gap
 * already flagged there for `SUPABASE_JWT_SECRET`.
 *
 * Returns a ready-to-send NextResponse when the request must be rejected:
 *  - 500 if `CRON_SECRET` itself isn't configured server-side (never
 *    silently no-op -- a misconfigured cron job should be loud, not quietly
 *    skip its work every time it fires).
 *  - 401 if the header is missing or doesn't match exactly.
 * Returns `null` when the request is authorized and the route should
 * proceed.
 */
export function verifyCronRequest(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 500 }
    );
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
