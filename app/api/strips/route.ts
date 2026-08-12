import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createStripSchema, listStripsBySessionQuerySchema } from "@/lib/validation/strip";
import { checkRateLimit } from "@/lib/rateLimit";
import { resolveClientIp } from "@/lib/http/clientIp";
import { getSessionById } from "@/lib/db/sessions";
import { createStrip, getStripsBySessionId } from "@/lib/db/strips";
import { uploadStripImage, mintSignedStripUrl } from "@/lib/storage";
import { trackEvent } from "@/lib/analytics";

// GET (list-by-session) needs the same "never let Next.js cache/reuse a
// minted signed URL" guarantee GET /api/strips/:id documents at length —
// same reasoning, so see that file for the full explanation of both flags.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** backend-schema §5: signed URLs are 5-15 min (300-900s) expiry. Picked 10 min as the response's immediate URL. */
const SIGNED_URL_EXPIRY_SECONDS = 600;

// Security audit finding: this route is unauthenticated by design (see the
// route-level comment below), so IP-keyed rate limiting is the only
// app-level anti-abuse guard against unbounded/repeated strip uploads.
// Mirrors the pattern + backend-schema §5 "e.g., 10 session creations/hour/IP"
// anti-abuse intent used by app/api/sessions/route.ts (10/hour) and
// app/api/sessions/[id]/join/route.ts (30/hour, generous for multiple
// participants on one NAT'd IP). A real user produces at most one strip per
// completed session, but EACH participant in a session uploads their OWN
// strip (this file's own route-level comment), so several strips can
// legitimately land from one shared/NAT'd IP in quick succession across
// several sessions in an hour -- plus the occasional failed-upload retry.
// 20/hour/IP is generous enough for that (a busy shared IP running several
// 4-participant sessions) while still bounding well below the unbounded
// abuse case the audit flagged.
const CREATE_STRIP_RATE_LIMIT = { limit: 20, windowSeconds: 60 * 60 };

// Mirrors GET /api/strips/:id's own GET_STRIP_RATE_LIMIT (60/hour/IP) — same
// unauthenticated, re-fetch-friendly posture (view/download/share/print all
// legitimately re-call this), just keyed by session lookups instead of a
// single strip id.
const LIST_STRIPS_RATE_LIMIT = { limit: 60, windowSeconds: 60 * 60 };

// No `s` (dotAll) flag needed: the payload arrives as a JSON string value,
// which can't contain a literal unescaped newline, so `.` already matches
// every character the base64 body could actually contain. (Also keeps this
// compatible with the project's current tsconfig target, which predates
// es2018's dotAll support.)
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,(.+)$/;

/** Decodes a validated `imageDataUrl` (createStripSchema already confirmed the prefix) into raw bytes + a Storage-path-safe extension. */
function decodeImageDataUrl(imageDataUrl: string): {
  bytes: Buffer;
  extension: "png" | "jpg";
} {
  const match = IMAGE_DATA_URL_PATTERN.exec(imageDataUrl);
  if (!match) {
    // Unreachable in practice — createStripSchema's regex already enforces
    // this prefix — but keeps this function safe to call standalone.
    throw new Error("imageDataUrl is not a valid base64 image data URL");
  }
  const [, mime, base64] = match;
  return {
    bytes: Buffer.from(base64, "base64"),
    extension: mime === "jpeg" ? "jpg" : "png",
  };
}

/**
 * POST /api/strips — upload the composited strip (TRD §5).
 *
 * createStripSchema -> resolve session (404 if missing) -> format-smuggling
 * guard (submitted `format` must match `sessions.format` read fresh from the
 * DB) -> decode + upload the image at
 * `strips/{session_id}/{strip_id}.png`/`.jpg` -> createStrip (persists
 * `storage_path`, never a baked-in URL, per backend-schema §3.4) -> mint a
 * fresh signed URL for the immediate response.
 *
 * Auth: deliberately NO Clerk auth requirement on this route. Reasoning:
 * - Each participant's client independently composites and uploads its OWN
 *   strip (lib/compositor.ts's resolved multi-participant design) — that
 *   includes anonymous participants in an upgraded (`format: '4'`) session,
 *   since the resolved 4-photo-unlock decision is "ONE logged-in participant
 *   unlocks the format for the WHOLE session" (implementation-plan.md,
 *   backend-schema §3.2/§3.3), not "every uploader must be logged in."
 *   Requiring Clerk auth here would break that already-resolved model.
 * - The capability this route needs to gate — "can this request claim
 *   format '4'?" — is already fully covered by the format-match guard below,
 *   which checks against `sessions.format` read fresh from the DB. That
 *   column can only ever be '4' if `/upgrade` (Phase 1) was previously
 *   called successfully, and `/upgrade` already enforces Clerk auth +
 *   session-participant membership server-side. So by the time a session's
 *   `format` row says '4', the auth check this route might otherwise
 *   duplicate has already happened, transitively, via the DB state itself.
 * - This route also takes no client-supplied `user_id` at all (unlike
 *   `/upgrade`/`/join`), so backend-schema §5's "never trust a
 *   client-supplied user_id" concern doesn't apply here — there's no
 *   identity field to mistrust.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createStripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clientIp = resolveClientIp(request);
  const { success } = await checkRateLimit(
    `strips:create:${clientIp}`,
    CREATE_STRIP_RATE_LIMIT
  );
  if (!success) {
    return NextResponse.json(
      { error: "Too many strips created recently. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const session = await getSessionById(parsed.data.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Format-smuggling guard: the compositor is entirely client-side, so the
    // server never sees individual photo counts — it can only check the
    // claimed `format` against the session's actual, server-controlled
    // `format` column. This stops a client from labeling/claiming a 4-photo
    // strip for a session that was never upgraded via the authenticated
    // /upgrade route (Phase 1).
    if (parsed.data.format !== session.format) {
      return NextResponse.json(
        {
          error: `Submitted format '${parsed.data.format}' does not match this session's format '${session.format}'`,
        },
        { status: 403 }
      );
    }

    const stripId = crypto.randomUUID();
    const { bytes, extension } = decodeImageDataUrl(parsed.data.imageDataUrl);
    const storagePath = `strips/${session.id}/${stripId}.${extension}`;

    await uploadStripImage(storagePath, bytes);

    const strip = await createStrip({
      id: stripId,
      sessionId: session.id,
      stylePreset: parsed.data.stylePreset,
      storagePath,
    });

    const signedUrl = await mintSignedStripUrl(
      strip.storage_path,
      SIGNED_URL_EXPIRY_SECONDS
    );

    // TRD item 9a / implementation-plan Phase 11: this route deliberately has
    // no Clerk auth requirement (see the route-level comment above), so there
    // is no authenticated identity to resolve here -- `userId` is always null.
    // trackEvent never rejects (see lib/analytics.ts), so this can't turn a
    // successful strip upload into a 500.
    await trackEvent({
      sessionId: strip.session_id,
      event: "strip_completed",
      userId: null,
    });

    return NextResponse.json(
      {
        id: strip.id,
        sessionId: strip.session_id,
        stylePreset: strip.style_preset,
        signedUrl,
        createdAt: strip.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "api", route: "strips:create" } });
    return NextResponse.json(
      { error: "Failed to create strip" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/strips?sessionId=:sessionId — look up the most recently created
 * strip for a session, for when `lib/stripStorage.ts`'s `sessionStorage`
 * hand-off isn't available on the current tab (a page reload after the tab
 * closed and reopened, a shared/opened-in-a-new-tab link, or returning to
 * `/session/:id/output` later) — OutputClient falls back to this once
 * `loadGeneratedStripId` comes back empty, rather than reporting "no strip"
 * for a session that actually has one server-side.
 *
 * Same unauthenticated posture as GET /api/strips/:id and GET
 * /api/sessions/:id (see their route-level comments): the session id is
 * itself the access-control mechanism (UUIDv4, non-guessable), and viewing
 * an already-generated strip has never required login (F-28).
 *
 * A session can have more than one strip (each participant uploads their
 * own, and re-editing via StripEditor creates a new row rather than
 * overwriting) — this deliberately returns only the latest by `created_at`,
 * matching "the strip this browser most recently produced/viewed" rather
 * than an arbitrary or full list.
 */
export async function GET(request: NextRequest) {
  const parsed = listStripsBySessionQuerySchema.safeParse({
    sessionId: request.nextUrl.searchParams.get("sessionId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  const clientIp = resolveClientIp(request);
  const { success } = await checkRateLimit(
    `strips:list:${clientIp}`,
    LIST_STRIPS_RATE_LIMIT
  );
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests recently. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const strips = await getStripsBySessionId(parsed.data.sessionId);
    if (strips.length === 0) {
      return NextResponse.json(
        { error: "No strip found for this session" },
        { status: 404 }
      );
    }

    const latest = strips.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    );
    const signedUrl = await mintSignedStripUrl(
      latest.storage_path,
      SIGNED_URL_EXPIRY_SECONDS
    );

    return NextResponse.json(
      {
        id: latest.id,
        sessionId: latest.session_id,
        stylePreset: latest.style_preset,
        signedUrl,
        createdAt: latest.created_at,
      },
      { status: 200 }
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "api", route: "strips:list" } });
    return NextResponse.json(
      { error: "Failed to look up strip" },
      { status: 500 }
    );
  }
}
