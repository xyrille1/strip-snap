import { STYLE_PRESETS } from "@/lib/validation/strip";

/**
 * Canvas-based strip compositing. Split into pure layout/geometry (no
 * Canvas/DOM dependency, unit-testable) and actual Canvas drawing (DOM-only,
 * exercised in-browser).
 *
 * Resolved multi-participant design (see the Phase 8 task brief that
 * resolved the gap Phase 7 flagged): there is no "one client composites for
 * everyone" election. Each participant's client independently composites and
 * uploads its OWN strip (TRD §3's data-flow language — "each client
 * composites final strip via Canvas"). What makes a multi-person strip read
 * as the group "together" is that EACH SLOT on the strip is itself a small
 * collage of every participant's shot at that index, not just the viewing
 * participant's own photo. For a solo session (participantCount === 1) a
 * slot collapses to a single full-frame region — the grid-of-1 case, so the
 * same code path serves solo, LDR-pair, and friend-group sessions uniformly.
 */

export type StripFormat = "3" | "4";
export type StylePreset = (typeof STYLE_PRESETS)[number];

/** One participant's image region within a slot, in ABSOLUTE canvas coordinates (not relative to the slot). */
export interface SubRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SlotLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * One entry per participant, in absolute canvas coordinates, ready to hand
   * straight to `drawStrip`/`ctx.drawImage` without further offset math.
   * Length always equals `participantCount` (clamped to at least 1) passed to
   * `computeStripLayout` — see that function's grid-scheme doc comment for
   * how these are arranged within the slot.
   */
  subRegions: SubRegion[];
}

export interface StripLayout {
  canvasWidth: number;
  canvasHeight: number;
  /** Film-black (#141210) per design brief §2 — the photostrip's own background, distinct from the page's cream background. */
  backgroundColor: string;
  slots: SlotLayout[];
}

// -- Geometry constants ------------------------------------------------
// A vertical photobooth strip: N stacked slots, one per shot index, with a
// consistent outer margin and inter-slot gutter. Slot aspect (4:3) matches
// lib/captureResolution.ts's captured-frame aspect so images fill their
// region without heavy letterboxing.
const CANVAS_MARGIN = 24;
const SLOT_GUTTER = 16;
const SLOT_WIDTH = 480;
const SLOT_HEIGHT = 360;
/** Gap between sub-regions within a single slot, when participantCount > 1. */
const SUB_REGION_GUTTER = 6;

/**
 * Arranges `count` sub-regions within `slot`:
 * - 1 participant: the sub-region IS the whole slot (no subdivision) — the
 *   solo-session case, full-frame per slot.
 * - 2 participants: side-by-side halves (an LDR pair reads left/right,
 *   matching how two faces naturally sit next to each other).
 * - 3+ participants: a row-major grid sized `ceil(sqrt(count))` columns by
 *   however many rows are needed to fit `count` cells (so 3-4 participants
 *   both land on a 2x2 grid, per the friend-group case; larger groups grow
 *   the grid rather than shrinking cells indefinitely into one dimension).
 *   Any unused trailing cells (e.g. the 4th cell when count === 3) are
 *   simply omitted — `drawStrip` never draws into them, leaving the
 *   film-black background visible there, consistent with how a dropped
 *   participant's own missing shot already renders as empty.
 */
function computeSubRegions(slot: SlotLayout, count: number): SubRegion[] {
  const n = Math.max(1, count);

  if (n === 1) {
    return [{ x: slot.x, y: slot.y, width: slot.width, height: slot.height }];
  }

  if (n === 2) {
    const halfWidth = (slot.width - SUB_REGION_GUTTER) / 2;
    return [
      { x: slot.x, y: slot.y, width: halfWidth, height: slot.height },
      {
        x: slot.x + halfWidth + SUB_REGION_GUTTER,
        y: slot.y,
        width: halfWidth,
        height: slot.height,
      },
    ];
  }

  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellWidth = (slot.width - (cols - 1) * SUB_REGION_GUTTER) / cols;
  const cellHeight = (slot.height - (rows - 1) * SUB_REGION_GUTTER) / rows;

  const regions: SubRegion[] = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    regions.push({
      x: slot.x + col * (cellWidth + SUB_REGION_GUTTER),
      y: slot.y + row * (cellHeight + SUB_REGION_GUTTER),
      width: cellWidth,
      height: cellHeight,
    });
  }
  return regions;
}

/**
 * Pure geometry: format + style preset + participant count -> slot/sub-region
 * positions. No Canvas/DOM dependency, so this is unit-testable without a
 * canvas polyfill.
 *
 * `participantCount` is an ADDED parameter beyond the original stub's
 * `(format, stylePreset)` signature — flagged per the task brief: the
 * original stub predates the resolved multi-participant collage design (see
 * this file's top doc comment); geometry can't be computed without knowing
 * how many participants' shots each slot needs to subdivide for.
 *
 * `stylePreset` does not currently affect geometry (every preset in
 * `STYLE_PRESETS` is a color/contrast treatment applied at draw time, not a
 * layout change — see `drawStrip`) — it's accepted here (a) to keep this
 * function's signature symmetric with `drawStrip`'s, and (b) validated at
 * runtime so an invalid preset fails fast at the layout step rather than
 * silently no-op'ing later in `drawStrip`.
 */
export function computeStripLayout(
  format: StripFormat,
  stylePreset: StylePreset,
  participantCount: number
): StripLayout {
  if (!STYLE_PRESETS.includes(stylePreset)) {
    throw new Error(`Unknown style preset: ${String(stylePreset)}`);
  }

  const slotCount = Number(format);
  const canvasWidth = SLOT_WIDTH + CANVAS_MARGIN * 2;
  const canvasHeight =
    CANVAS_MARGIN * 2 + slotCount * SLOT_HEIGHT + (slotCount - 1) * SLOT_GUTTER;

  const slots: SlotLayout[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    const slotX = CANVAS_MARGIN;
    const slotY = CANVAS_MARGIN + i * (SLOT_HEIGHT + SLOT_GUTTER);
    const base: SlotLayout = {
      x: slotX,
      y: slotY,
      width: SLOT_WIDTH,
      height: SLOT_HEIGHT,
      subRegions: [],
    };
    base.subRegions = computeSubRegions(base, participantCount);
    slots.push(base);
  }

  return {
    canvasWidth,
    canvasHeight,
    backgroundColor: "#141210", // film-black
    slots,
  };
}

// -- Canvas filter per style preset -------------------------------------
// STYLE_PRESETS (lib/validation/strip.ts): classic_bw, sepia, vintage_warm,
// high_contrast_mono. Implemented as CSS-syntax Canvas 2D `filter` strings —
// simple, well-supported, and enough to realize each preset's name without
// inventing presets that aren't in the locked list.
const STYLE_FILTERS: Record<StylePreset, string> = {
  classic_bw: "grayscale(100%)",
  sepia: "sepia(100%)",
  // Warm, slightly faded retro look: partial sepia + a contrast/saturation
  // lift so it reads as "warm" rather than just "washed out."
  vintage_warm: "sepia(35%) saturate(140%) contrast(105%) brightness(105%)",
  high_contrast_mono: "grayscale(100%) contrast(150%)",
};

/**
 * Per-slot, per-participant images. `images[slotIndex][subRegionIndex]`
 * corresponds to `layout.slots[slotIndex].subRegions[subRegionIndex]`.
 * `null` means "no shot for this participant at this slot" (e.g. a dropped
 * participant, per the resolved dropped-participant assumption) — `drawStrip`
 * leaves that sub-region showing the film-black background rather than
 * drawing anything.
 *
 * This is a 2D structure rather than the original stub's flat
 * `CanvasImageSource[]` — flagged per the task brief: a flat array can't
 * express "which participant's shot goes in which sub-region of which slot"
 * once a slot can hold more than one participant's image.
 */
export type StripImages = (CanvasImageSource | null)[][];

/**
 * Draws `images` into `ctx` using the geometry from `computeStripLayout`.
 * DOM-dependent — exercised in-browser only.
 */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  layout: StripLayout,
  images: StripImages,
  stylePreset: StylePreset
): void {
  const filter = STYLE_FILTERS[stylePreset];
  if (!filter) {
    throw new Error(`Unknown style preset: ${String(stylePreset)}`);
  }

  // Background first, at the default (no-filter) state — the strip's own
  // film-black backdrop is never tinted by the style preset.
  ctx.save();
  ctx.filter = "none";
  ctx.fillStyle = layout.backgroundColor;
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  ctx.restore();

  layout.slots.forEach((slot, slotIndex) => {
    const slotImages = images[slotIndex] ?? [];

    slot.subRegions.forEach((region, regionIndex) => {
      const image = slotImages[regionIndex];
      if (!image) return; // no shot for this participant/slot — leave film-black showing.

      ctx.save();
      // Style preset is applied uniformly, per-image, at draw time — never
      // baked into the layout step, so switching presets before confirming
      // always redraws every image fresh from `images` with the newly
      // selected filter (no stale bleed from a previous preset's draw).
      ctx.filter = filter;
      ctx.drawImage(image, region.x, region.y, region.width, region.height);
      ctx.restore();
    });
  });
}
