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

export const createStripSchema = z.object({
  sessionId: z.string().uuid(),
  stylePreset: z.enum(STYLE_PRESETS),
});

export type CreateStripInput = z.infer<typeof createStripSchema>;
