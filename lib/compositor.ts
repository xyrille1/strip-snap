import type { STYLE_PRESETS } from "@/lib/validation/strip";

/**
 * Canvas-based strip compositing. Split into pure layout/geometry (no
 * Canvas/DOM dependency, unit-testable) and actual Canvas drawing (DOM-only,
 * exercised in-browser). Real implementation lands in Step 4 Item 7.
 */

export type StripFormat = "3" | "4";
export type StylePreset = (typeof STYLE_PRESETS)[number];

export interface SlotLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StripLayout {
  canvasWidth: number;
  canvasHeight: number;
  slots: SlotLayout[];
}

/**
 * Pure geometry: format + style preset -> slot positions. No Canvas/DOM
 * dependency, so this is unit-testable without a canvas polyfill.
 */
export function computeStripLayout(
  format: StripFormat,
  stylePreset: StylePreset
): StripLayout {
  void format;
  void stylePreset;
  throw new Error("not implemented");
}

/**
 * Draws `images` into `ctx` using the geometry from `computeStripLayout`.
 * DOM-dependent — exercised in-browser only.
 */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  layout: StripLayout,
  images: CanvasImageSource[],
  stylePreset: StylePreset
): void {
  void ctx;
  void layout;
  void images;
  void stylePreset;
  throw new Error("not implemented");
}
