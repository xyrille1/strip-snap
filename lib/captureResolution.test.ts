import { describe, expect, it } from "vitest";
import {
  CAPTURE_JPEG_QUALITY,
  MAX_CAPTURE_HEIGHT,
  MAX_CAPTURE_WIDTH,
  computeCaptureDimensions,
} from "./captureResolution";

describe("lib/captureResolution#computeCaptureDimensions", () => {
  it("exports the documented cap constants", () => {
    expect(MAX_CAPTURE_WIDTH).toBe(720);
    expect(MAX_CAPTURE_HEIGHT).toBe(960);
    expect(CAPTURE_JPEG_QUALITY).toBeGreaterThan(0);
    expect(CAPTURE_JPEG_QUALITY).toBeLessThanOrEqual(1);
  });

  it("leaves dimensions unchanged when already within bounds", () => {
    expect(computeCaptureDimensions(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("never upscales a source smaller than the cap", () => {
    expect(computeCaptureDimensions(320, 240)).toEqual({ width: 320, height: 240 });
  });

  it("downscales a large landscape source proportionally to fit within the cap", () => {
    // 1920x1080 -> limited by height (960/1080 = 0.8888...) since that's the
    // tighter of the two ratios (720/1920 = 0.375 vs 960/1080 = 0.888).
    expect(computeCaptureDimensions(1920, 1080)).toEqual({ width: 720, height: 405 });
  });

  it("downscales a tall portrait source proportionally, bound by height", () => {
    // 1080x1920 -> scale = min(1, 720/1080=0.667, 960/1920=0.5) = 0.5 (height is the tighter ratio).
    expect(computeCaptureDimensions(1080, 1920)).toEqual({ width: 540, height: 960 });
  });

  it("downscales a wider portrait source proportionally, bound by width", () => {
    // 900x1000 -> scale = min(1, 720/900=0.8, 960/1000=0.96) = 0.8 (width is the tighter ratio).
    expect(computeCaptureDimensions(900, 1000)).toEqual({ width: 720, height: 800 });
  });

  it("falls back to the max bounds when native dimensions are not yet known (0)", () => {
    expect(computeCaptureDimensions(0, 0)).toEqual({
      width: MAX_CAPTURE_WIDTH,
      height: MAX_CAPTURE_HEIGHT,
    });
  });

  it("falls back to the max bounds when native dimensions are negative", () => {
    expect(computeCaptureDimensions(-1, -1)).toEqual({
      width: MAX_CAPTURE_WIDTH,
      height: MAX_CAPTURE_HEIGHT,
    });
  });

  it("respects custom max bounds passed by the caller", () => {
    expect(computeCaptureDimensions(2000, 2000, 100, 200)).toEqual({
      width: 100,
      height: 100,
    });
  });
});
