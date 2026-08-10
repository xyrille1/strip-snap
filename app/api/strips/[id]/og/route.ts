import { NextRequest, NextResponse } from "next/server";
import { stripIdParamSchema } from "@/lib/validation/strip";
import { getStripById } from "@/lib/db/strips";
import { mintSignedStripUrl } from "@/lib/storage";

/** backend-schema §5: signed URLs are 5-15 min (300-900s) expiry. */
const SIGNED_URL_EXPIRY_SECONDS = 600;

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/strips/:id/og — stable redirect target for `og:image`/Twitter
 * card meta tags on the public /strip/:id share page.
 *
 * A social-media crawler doesn't fetch a shared link's `og:image` at share
 * time — it fetches it whenever it next crawls the page, which can be
 * minutes to hours later. Baking a signed URL directly into the HTML
 * (`SIGNED_URL_EXPIRY_SECONDS` = 10 min) would go dead before most crawlers
 * ever see it. Pointing `og:image` at this route instead keeps the embedded
 * URL stable forever; each fetch mints a fresh signed URL on demand and
 * 302s to it, same pattern GET /api/strips/:id already uses for the JSON
 * API.
 *
 * No auth required — same posture as GET /api/strips/:id (F-28, the strip
 * id itself is the access-control mechanism).
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

  return NextResponse.redirect(signedUrl);
}
