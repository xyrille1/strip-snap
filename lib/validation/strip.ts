import { z } from "zod";

/**
 * The fixed, small set of retro presets (docs only specify "small set of
 * retro presets" without naming them — these 4 are the locked decision).
 * Single source of truth: other files should import this rather than
 * redefine the list.
 */
export const STYLE_PRESETS = [
  "classic_bw",
  "sepia",
  "vintage_warm",
  "high_contrast_mono",
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
