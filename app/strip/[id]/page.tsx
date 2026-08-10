import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { stripIdParamSchema } from "@/lib/validation/strip";
import { getStripById } from "@/lib/db/strips";
import { mintSignedStripUrl } from "@/lib/storage";
import StripView from "./StripView";

// React request-memoized: generateMetadata and StripPage below both need the
// same row, and without this they'd each independently query it.
const getStrip = cache(getStripById);

interface StripPageProps {
  params: { id: string };
}

const SHARE_TITLE = "A shared photo strip — Strip Snap";
const SHARE_DESCRIPTION =
  "Someone shared their retro photobooth strip with you — no account or invite needed to view it.";

/**
 * Real per-link OG/Twitter card metadata for the one page on this site
 * meant to be shared. Points `images` at GET /api/strips/:id/og (a stable
 * redirect target) rather than a directly-minted signed URL — see that
 * route's doc comment for why a signed URL can't be embedded here directly
 * (it expires long before most crawlers fetch it).
 *
 * Falls back to the layout's generic metadata (no `openGraph`/`twitter`
 * override) for an invalid/missing id — `StripPage` below still calls
 * `notFound()` for the actual page render in that case.
 */
export async function generateMetadata({
  params,
}: StripPageProps): Promise<Metadata> {
  const parsed = stripIdParamSchema.safeParse(params);
  if (!parsed.success) return {};

  const strip = await getStrip(parsed.data.id);
  if (!strip) return {};

  const ogImagePath = `/api/strips/${strip.id}/og`;

  return {
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    openGraph: {
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: [{ url: ogImagePath }],
    },
    twitter: {
      card: "summary_large_image",
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: [ogImagePath],
    },
  };
}

/** backend-schema §5: signed URLs are 5-15 min (300-900s) expiry. Matches GET /api/strips/:id's own choice. */
const SIGNED_URL_EXPIRY_SECONDS = 600;

/**
 * `dynamic = "force-dynamic"` (same reasoning as app/api/time/route.ts and
 * GET /api/strips/:id): without this directive, Next.js can treat the whole
 * route as static (no dynamic APIs like cookies/headers/searchParams are
 * read here) and render it ONCE at build/deploy time, baking in that
 * build's signed URL forever. Forcing dynamic rendering at the page/segment
 * level makes this component re-run on every request.
 *
 * `fetchCache = "force-no-store"` is ALSO required, and is NOT redundant
 * with `dynamic` above: `getStripById`/`mintSignedStripUrl` go through
 * `supabase-js`, which calls the platform `fetch()` under the hood to talk
 * to PostgREST/Storage — a call Next.js's Data Cache intercepts
 * independently of this segment's `dynamic` rendering config. Verified
 * empirically in dev (same finding as GET /api/strips/:id): with only
 * `dynamic = "force-dynamic"` set, this page kept rendering a
 * byte-identical stale signed URL across repeat requests even though the
 * component itself re-executed every time. `fetchCache = "force-no-store"`
 * forces every fetch in this route segment to bypass the Data Cache
 * regardless of the call site's own cache option — this is what actually
 * makes the signed URL fresh on every load.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Public share view (TRD §8b, F-28) — deliberately has NO `auth()` call, NO
 * session-participation check, and NO redirect-if-not-joined logic: the
 * strip id itself is the access-control mechanism (backend-schema §1.3,
 * UUIDv4, non-guessable), matching `GET /api/strips/:id`'s own posture
 * (Phase 9). This is a Server Component that calls `getStripById` +
 * `mintSignedStripUrl` — the same primitives `GET /api/strips/:id` uses —
 * directly, rather than fetching that route over HTTP, since a server
 * component calling its own API route would just be an unnecessary extra
 * network hop for the identical result.
 */
export default async function StripPage({ params }: StripPageProps) {
  const parsed = stripIdParamSchema.safeParse(params);
  if (!parsed.success) notFound();

  const strip = await getStrip(parsed.data.id);
  if (!strip) notFound();

  const signedUrl = await mintSignedStripUrl(strip.storage_path, SIGNED_URL_EXPIRY_SECONDS);

  return <StripView stripId={strip.id} signedUrl={signedUrl} />;
}
