import { NextRequest, NextResponse } from "next/server";
import { stripIdParamSchema } from "@/lib/validation/strip";
import { getStripById } from "@/lib/db/strips";
import { mintSignedStripUrl } from "@/lib/storage";

/** backend-schema §5: signed URLs are 5-15 min (300-900s) expiry. */
const SIGNED_URL_EXPIRY_SECONDS = 600;

/**
 * GET /api/strips/:id — fetch a strip for share/download/print (TRD §5).
 *
 * getStripById (404 if missing) -> mint a FRESH signed URL on every call via
 * `lib/storage.ts#mintSignedStripUrl` — never cache or reuse a previously
 * minted URL, per backend-schema §3.4/§5 ("expired signed URLs can be
 * re-issued on demand"). This is what makes S-03 pass: two calls made after
 * an earlier URL's expiry window both succeed, each returning its own
 * independently-valid signed URL, because the DB only ever stores
 * `storage_path`, never a baked-in URL.
 *
 * No auth required — matches GET /api/sessions/:id's posture and TRD/PRD's
 * "no login needed to view a finished strip" requirement (F-28); the id
 * itself is the access-control mechanism (backend-schema §1.3, UUIDv4,
 * non-guessable).
 *
 * `dynamic = "force-dynamic"` (same reasoning as app/api/time/route.ts):
 * without it, Next.js can statically optimize/cache this handler and would
 * serve the SAME minted signed URL forever instead of calling
 * `mintSignedStripUrl` fresh every request — exactly the S-03 regression
 * this route exists to prevent (backend-schema §5, 5-15 min expiry means a
 * cached response would eventually hand out an expired/dead link).
 *
 * `fetchCache = "force-no-store"` is ALSO required, not just defensive
 * belt-and-suspenders: `getStripById`/`mintSignedStripUrl` go through
 * `supabase-js`, which calls the platform `fetch()` under the hood to talk
 * to PostgREST/Storage. Next.js's Data Cache intercepts that `fetch()` and,
 * verified empirically in dev, kept serving a byte-identical stale signed
 * URL on every subsequent request EVEN with `dynamic = "force-dynamic"`
 * alone set — the route handler re-ran (confirmed via per-request log
 * timing), but the inner `fetch()` result was still served from cache.
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

  const parsed = stripIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid strip id" }, { status: 400 });
  }

  const strip = await getStripById(parsed.data.id);
  if (!strip) {
    return NextResponse.json({ error: "Strip not found" }, { status: 404 });
  }

  const signedUrl = await mintSignedStripUrl(
    strip.storage_path,
    SIGNED_URL_EXPIRY_SECONDS
  );

  return NextResponse.json(
    {
      id: strip.id,
      sessionId: strip.session_id,
      stylePreset: strip.style_preset,
      signedUrl,
      createdAt: strip.created_at,
    },
    { status: 200 }
  );
}
