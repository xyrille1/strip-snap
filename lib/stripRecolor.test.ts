import { describe, expect, it } from "vitest";
import { inferStripFormat } from "./stripRecolor";

/**
 * Only `inferStripFormat` (pure) is tested here — `recolorStripBase` is
 * Canvas2D/DOM-dependent and this project has no jsdom/canvas polyfill
 * (vitest.config.ts's `environment: "node"`), exactly like `drawStrip` in
 * lib/compositor.ts is never unit-tested today.
 */
describe("lib/stripRecolor#inferStripFormat", () => {
  it("recognizes format 3's exact canvas dimensions (408x1520)", () => {
    expect(inferStripFormat(408, 1520)).toBe("3");
  });

  it("recognizes format 4's exact canvas dimensions (408x2016)", () => {
    expect(inferStripFormat(408, 2016)).toBe("4");
  });

  it("returns null for a mismatched width with an otherwise-valid height", () => {
    expect(inferStripFormat(500, 1520)).toBeNull();
  });

  it("returns null for an unrelated height", () => {
    expect(inferStripFormat(408, 1000)).toBeNull();
  });

  it("returns null for zero dimensions", () => {
    expect(inferStripFormat(0, 0)).toBeNull();
  });

  it("returns null for negative dimensions", () => {
    expect(inferStripFormat(-408, -1520)).toBeNull();
  });
});
