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
 */
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
