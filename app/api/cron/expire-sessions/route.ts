import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronRequest } from "@/lib/cronAuth";
import {
  getExpiredSessions,
  expireSession,
  getSessionsPendingDeletion,
  deleteSession,
} from "@/lib/db/sessions";
import { getStripsBySessionId } from "@/lib/db/strips";
import { deleteStripImage } from "@/lib/storage";

/**
 * Delay between a session being marked `expired` and becoming eligible for
 * hard deletion (backend-schema §7: "sets status = 'expired' and, on a
 * short delay after that, deletes the row"). There is no dedicated
 * `expired_at` timestamp column (backend-schema §3.2 only has
 * `expires_at`), so `expires_at` is reused as the anchor for both phases
 * below -- see `lib/db/sessions.ts#getSessionsPendingDeletion`.
 */
const DELETE_BUFFER_MS = 60 * 60 * 1000; // 1 hour

/**
 * GET /api/cron/expire-sessions — Vercel Cron: 24h TTL sweep (TRD item 9b;
 * backend-schema §7).
 *
 * Two-phase sweep, run in this specific order:
 *
 *  Phase B (delete) runs FIRST, against sessions already `status =
 *  'expired'` from a *previous* run whose `expires_at` is more than
 *  `DELETE_BUFFER_MS` in the past. Querying this list before Phase A does
 *  any mutating means a session Phase A is about to mark `expired` in THIS
 *  run cannot possibly appear in this run's delete set -- at query time it
 *  still has its pre-expiry status, regardless of how far in the past its
 *  `expires_at` happens to be. This is what actually guarantees "don't
 *  hard-delete in the same pass a session was just marked expired," rather
 *  than relying solely on the buffer window (which alone wouldn't cover a
 *  session whose `expires_at` was already more than an hour ago the first
 *  time this job saw it, e.g. after a missed run).
 *
 *  For each session being deleted: fetch its strips first and delete each
 *  one's Storage object via `deleteStripImage(strip.storage_path)` BEFORE
 *  the session row is deleted. Postgres cascades `strips`/`participants` on
 *  session delete (backend-schema §3.3/§3.4's `on delete cascade`), but
 *  cascades never touch Storage objects, so `storage_path` becomes
 *  unrecoverable once the DB row is gone -- Storage cleanup must happen
 *  first. `analytics_events` is NOT cascaded (`on delete set null` per
 *  backend-schema §3.5/§7), so those historical rows survive intentionally.
 *
 *  Phase A (mark expired) runs second: sessions past `expires_at` that
 *  aren't yet `status = 'expired'` (`getExpiredSessions`) are marked
 *  `expired` (`expireSession`). They become delete-eligible on a future run
 *  once `DELETE_BUFFER_MS` has elapsed since their `expires_at`.
 */
export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const toDelete = await getSessionsPendingDeletion(DELETE_BUFFER_MS);
    for (const session of toDelete) {
      const strips = await getStripsBySessionId(session.id);
      for (const strip of strips) {
        await deleteStripImage(strip.storage_path);
      }
      await deleteSession(session.id);
    }

    const toExpire = await getExpiredSessions();
    for (const session of toExpire) {
      await expireSession(session.id);
    }

    return NextResponse.json(
      { expired: toExpire.length, deleted: toDelete.length },
      { status: 200 }
    );
  } catch (error) {
    // ops-runbook.md §7: cron job failures instrumentation — a silent
    // failure here means expired sessions/strips/Storage objects pile up
    // unnoticed instead of being cleaned up on the 24h TTL sweep.
    Sentry.captureException(error, {
      tags: { area: "cron", job: "expire-sessions" },
    });
    return NextResponse.json(
      { error: "expire-sessions cron job failed" },
      { status: 500 }
    );
  }
}
