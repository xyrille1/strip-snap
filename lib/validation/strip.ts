import { z } from "zod";

/**
 * The fixed, small set of retro presets (docs only specify "small set of
 * retro presets" without naming them — these 4 are the locked decision), plus
 * `original` — a true no-filter pass-through (the camera's own colors,
 * unmodified) for anyone who doesn't want a retro treatment at all.
 * Appended at the end so `STYLE_PRESETS[0]` (the default selection elsewhere,
 * e.g. StyleClient.tsx) stays `classic_bw`, unchanged by this addition.
 * Single source of truth: other files should import this rather than
 * redefine the list.
 */
export const STYLE_PRESETS = [
  "classic_bw",
  "sepia",
  "vintage_warm",
  "high_contrast_mono",
  "original",
] as const;

/**
 * Matches only the `data:image/(png|jpeg);base64,` prefix — deliberately NOT
 * validating the full base64 body against this regex (a multi-MB strip image
 * would make a whole-body regex scan wasteful). The prefix check is enough to
 * reject non-image/malformed payloads before they reach Buffer.from() in the
 * route handler; a truly corrupt base64 body still fails safely there.
 */
const IMAGE_DATA_URL_PREFIX = /^data:image\/(png|jpeg);base64,/;

/**
 * Upper bound on `imageDataUrl`'s string length -- an app-level cap against
 * unbounded/repeated-abuse uploads (security audit finding), sized with
 * headroom above the largest real composited strip this app can produce.
 *
 * Derived from the actual canvas geometry (lib/compositor.ts) and encoding
 * (lib/compositeStrip.ts), not guessed:
 * - Canvas is fixed at SLOT_WIDTH(360) + CANVAS_MARGIN(24)*2 = 408px wide.
 * - Tallest case is format '4' (4 slots): CANVAS_MARGIN(24)*2 +
 *   4*SLOT_HEIGHT(480) + 3*SLOT_GUTTER(16) = 2016px tall.
 *   (participantCount only subdivides a slot internally -- lib/compositor.ts's
 *   computeSubRegions -- it never changes canvasWidth/canvasHeight.)
 * - Worst-case raw RGBA bitmap: 408 * 2016 * 4 bytes ~= 3.14 MiB.
 * - compositeStripToDataUrl defaults to PNG (lossless); base64 inflates raw
 *   bytes by 4/3 ~= 4.19 MiB. PNG's deflate framing can only add a small,
 *   bounded overhead over raw even for incompressible content (a filter byte
 *   per scanline + zlib's ~0.4% "stored block" worst case), so ~4.3 MiB is a
 *   realistic ceiling for this app's actual output.
 * - Capped at 8 MiB (8 * 1024 * 1024 chars) here: ~1.9x that ceiling, enough
 *   headroom for browser/encoder variance without materially loosening the
 *   cap -- still firmly rejects the unbounded payloads the audit flagged.
 */
const IMAGE_DATA_URL_MAX_LENGTH = 8 * 1024 * 1024;

/**
 * `format` and `imageDataUrl` are ADDITIONS beyond the original stub, flagged
 * per the task brief rather than silently invented:
 *
 * - `imageDataUrl`: the original schema had no field at all for the
 *   composited image itself. Since compositing is entirely client-side
 *   (Canvas, lib/compositor.ts) and the server never sees individual photos,
 *   the final flattened image has to arrive somehow for POST /api/strips to
 *   have anything to upload. Every other client-side image hand-off in this
 *   codebase already uses base64 data-URL strings (lib/shotStorage.ts,
 *   lib/sessionShotsStorage.ts, StripPreview.tsx's `loadImage(dataUrl)`), so
 *   this follows that established idiom rather than introducing multipart
 *   upload as a new pattern.
 * - `format`: the original schema had no field to check against
 *   `sessions.format` at all, so the format-smuggling guard described in the
 *   Phase 9 task brief (reject a claimed '4' when the session was never
 *   upgraded) had nothing to compare. Mirrors `sessions.format`'s own type
 *   exactly (`session_format` enum, backend-schema §3.2) so the API route can
 *   do a direct equality check against the fresh DB value.
 */
export const createStripSchema = z.object({
  sessionId: z.string().uuid(),
  stylePreset: z.enum(STYLE_PRESETS),
  format: z.enum(["3", "4"]),
  imageDataUrl: z
    .string()
    .min(1)
    .max(
      IMAGE_DATA_URL_MAX_LENGTH,
      `imageDataUrl must not exceed ${IMAGE_DATA_URL_MAX_LENGTH} characters`
    )
    .regex(
      IMAGE_DATA_URL_PREFIX,
      "imageDataUrl must be a base64 PNG or JPEG data URL"
    ),
});

export type CreateStripInput = z.infer<typeof createStripSchema>;

/** Validates the `:id` route param shape on GET /api/strips/:id. Mirrors sessionIdParamSchema's shape (lib/validation/session.ts). */
export const stripIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type StripIdParamInput = z.infer<typeof stripIdParamSchema>;
