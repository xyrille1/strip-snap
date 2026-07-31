import { describe, expect, it } from "vitest";
import { STYLE_PRESETS, createStripSchema } from "./strip";

describe("STYLE_PRESETS", () => {
  it("is the locked set of 4 retro presets", () => {
    expect(STYLE_PRESETS).toEqual([
      "classic_bw",
      "sepia",
      "vintage_warm",
      "high_contrast_mono",
    ]);
  });
});

describe("createStripSchema", () => {
  const sessionId = "123e4567-e89b-12d3-a456-426614174000";

  it.each(STYLE_PRESETS)("accepts valid style preset '%s'", (stylePreset) => {
    const result = createStripSchema.safeParse({ sessionId, stylePreset });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized style_preset", () => {
    const result = createStripSchema.safeParse({
      sessionId,
      stylePreset: "black_and_white_but_wrong",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed session id (not a UUID)", () => {
    const result = createStripSchema.safeParse({
      sessionId: "not-a-uuid",
      stylePreset: "classic_bw",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing stylePreset", () => {
    const result = createStripSchema.safeParse({ sessionId });
    expect(result.success).toBe(false);
  });
});
