import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/expire-sessions — Vercel Cron: 24h TTL sweep.
 * Real implementation (Step 4 Item 9b): guard with a CRON_SECRET header;
 * two-phase sweep — mark newly-past-TTL sessions 'expired'
 * (lib/db/sessions.ts#getExpiredSessions / #expireSession), then hard-delete
 * previously-expired ones, explicitly removing each strip's Storage object
 * (via storage_path) before the cascade delete runs, since Postgres cascade
 * deletes never touch Storage objects.
 */
export async function GET(request: NextRequest) {
  void request;
  return NextResponse.json({ expired: 0, deleted: 0 }, { status: 501 });
}
