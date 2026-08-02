import { describe, expect, it } from "vitest";
import { computeStripLayout, type StripFormat } from "./compositor";
import { STYLE_PRESETS } from "./validation/strip";

const FORMATS: StripFormat[] = ["3", "4"];
// Representative of solo (1), LDR-pair (2), and full friend-group (4), per
// the task brief.
const PARTICIPANT_COUNTS = [1, 2, 4];

describe("lib/compositor#computeStripLayout", () => {
  for (const format of FORMATS) {
    for (const stylePreset of STYLE_PRESETS) {
      for (const participantCount of PARTICIPANT_COUNTS) {
        it(`format ${format}, preset ${stylePreset}, ${participantCount} participant(s) — valid geometry`, () => {
          const layout = computeStripLayout(format, stylePreset, participantCount);

          // Slot count matches the format.
          expect(layout.slots).toHaveLength(Number(format));

          // Canvas has positive, finite dimensions.
          expect(layout.canvasWidth).toBeGreaterThan(0);
          expect(layout.canvasHeight).toBeGreaterThan(0);

          // film-black background per design brief §2 — never a new color.
          expect(layout.backgroundColor).toBe("#141210");

          for (const slot of layout.slots) {
            // Every slot fits within canvas bounds.
            expect(slot.x).toBeGreaterThanOrEqual(0);
            expect(slot.y).toBeGreaterThanOrEqual(0);
            expect(slot.x + slot.width).toBeLessThanOrEqual(layout.canvasWidth);
            expect(slot.y + slot.height).toBeLessThanOrEqual(layout.canvasHeight);

            // Exactly one sub-region per participant.
            expect(slot.subRegions).toHaveLength(participantCount);

            for (const region of slot.subRegions) {
              expect(region.width).toBeGreaterThan(0);
              expect(region.height).toBeGreaterThan(0);
              // Every sub-region fits within its parent slot.
              expect(region.x).toBeGreaterThanOrEqual(slot.x);
              expect(region.y).toBeGreaterThanOrEqual(slot.y);
              expect(region.x + region.width).toBeLessThanOrEqual(slot.x + slot.width + 0.01);
              expect(region.y + region.height).toBeLessThanOrEqual(slot.y + slot.height + 0.01);
            }
          }
        });
      }
    }
  }

  it("slots are stacked vertically, top to bottom, in shot order (no overlap)", () => {
    const layout = computeStripLayout("4", "classic_bw", 1);

    for (let i = 1; i < layout.slots.length; i += 1) {
      const prev = layout.slots[i - 1];
      const curr = layout.slots[i];
      expect(curr.y).toBeGreaterThanOrEqual(prev.y + prev.height);
    }
  });

  it("participantCount === 1 collapses the sub-region to the full slot (no subdivision)", () => {
    const layout = computeStripLayout("3", "sepia", 1);

    for (const slot of layout.slots) {
      expect(slot.subRegions).toEqual([
        { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
      ]);
    }
  });

  it("participantCount === 2 splits each slot into side-by-side halves", () => {
    const layout = computeStripLayout("3", "vintage_warm", 2);

    for (const slot of layout.slots) {
      const [left, right] = slot.subRegions;
      expect(left.y).toBe(slot.y);
      expect(right.y).toBe(slot.y);
      expect(left.height).toBe(slot.height);
      expect(right.height).toBe(slot.height);
      // Left sits to the left of right, with no horizontal overlap.
      expect(left.x).toBeLessThan(right.x);
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      // Halves are equal width.
      expect(left.width).toBeCloseTo(right.width, 5);
    }
  });

  it("participantCount === 4 arranges sub-regions in a 2x2 grid", () => {
    const layout = computeStripLayout("4", "high_contrast_mono", 4);

    for (const slot of layout.slots) {
      expect(slot.subRegions).toHaveLength(4);
      const [topLeft, topRight, bottomLeft, bottomRight] = slot.subRegions;

      // Top row shares a y, bottom row shares a different (larger) y.
      expect(topLeft.y).toBe(topRight.y);
      expect(bottomLeft.y).toBe(bottomRight.y);
      expect(bottomLeft.y).toBeGreaterThan(topLeft.y);

      // Left column shares an x, right column shares a different (larger) x.
      expect(topLeft.x).toBe(bottomLeft.x);
      expect(topRight.x).toBe(bottomRight.x);
      expect(topRight.x).toBeGreaterThan(topLeft.x);
    }
  });

  it("throws for an unknown style preset (runtime guard beyond the type system)", () => {
    expect(() =>
      // @ts-expect-error intentionally invalid for the runtime-guard test
      computeStripLayout("3", "not_a_real_preset", 1)
    ).toThrow();
  });
});
