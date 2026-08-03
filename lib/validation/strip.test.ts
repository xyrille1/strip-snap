import { describe, expect, it } from "vitest";
import { STYLE_PRESETS, createStripSchema, stripIdParamSchema } from "./strip";

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
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  const jpegDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD==";
  const validBody = {
    sessionId,
    stylePreset: "classic_bw" as const,
    format: "3" as const,
    imageDataUrl: pngDataUrl,
  };

  it.each(STYLE_PRESETS)("accepts valid style preset '%s'", (stylePreset) => {
    const result = createStripSchema.safeParse({ ...validBody, stylePreset });
    expect(result.success).toBe(true);
  });

  it.each(["3", "4"] as const)("accepts valid format '%s'", (format) => {
    const result = createStripSchema.safeParse({ ...validBody, format });
    expect(result.success).toBe(true);
  });

  it("accepts a base64 JPEG data URL as well as PNG", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      imageDataUrl: jpegDataUrl,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an imageDataUrl right at the 8 MiB max length", () => {
    const maxLength = 8 * 1024 * 1024;
    const prefix = "data:image/png;base64,";
    const body = "A".repeat(maxLength - prefix.length);
    const result = createStripSchema.safeParse({
      ...validBody,
      imageDataUrl: `${prefix}${body}`,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an imageDataUrl exceeding the 8 MiB max length", () => {
    const maxLength = 8 * 1024 * 1024;
    const prefix = "data:image/png;base64,";
    const body = "A".repeat(maxLength - prefix.length + 1);
    const result = createStripSchema.safeParse({
      ...validBody,
      imageDataUrl: `${prefix}${body}`,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized style_preset", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      stylePreset: "black_and_white_but_wrong",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed session id (not a UUID)", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing stylePreset", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      stylePreset: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized format (e.g. '5')", () => {
    const result = createStripSchema.safeParse({ ...validBody, format: "5" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing format", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      format: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing imageDataUrl", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      imageDataUrl: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an imageDataUrl that isn't an image data URL", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      imageDataUrl: "not-a-data-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an imageDataUrl with a disallowed mime type", () => {
    const result = createStripSchema.safeParse({
      ...validBody,
      imageDataUrl: "data:image/gif;base64,R0lGODlh==",
    });
    expect(result.success).toBe(false);
  });
});

describe("stripIdParamSchema", () => {
  it("accepts a valid UUID", () => {
    const result = stripIdParamSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    const result = stripIdParamSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
