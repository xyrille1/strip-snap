import {
  CANVAS_MARGIN,
  SPROCKET_HOLE_RADIUS,
  SPROCKET_HOLE_SPACING,
  computeStripLayout,
  type StripFormat,
} from "@/lib/compositor";

/**
 * Background/margin recolor for an already-flattened strip PNG (the strip
 * editor's "Color" tool — components/booth/StripEditor.tsx). Mirrors
 * lib/compositor.ts's pure/DOM split: `inferStripFormat` is pure and
 * unit-tested (lib/stripRecolor.test.ts); `recolorStripBase` is Canvas2D/DOM
 * -only, exercised in-browser only, same as `drawStrip` today.
 */

/**
 * Slot geometry depends only on `format` ("3"|"4"), never on style preset or
 * participant count (lib/compositor.ts#computeStripLayout's own doc
 * comment) — `canvasWidth` is always 408; `canvasHeight` is 1520 for format
 * "3" and 2016 for format "4". That means the format of an already-flattened
 * strip PNG can be inferred purely from its own pixel dimensions, with no
 * extra API/DB field needed. Any style preset/participant count works here
 * since neither affects the outer canvas dimensions this checks against.
 */
export function inferStripFormat(
  naturalWidth: number,
  naturalHeight: number
): StripFormat | null {
  const formats: StripFormat[] = ["3", "4"];
  for (const format of formats) {
    const layout = computeStripLayout(format, "classic_bw", 1);
    if (layout.canvasWidth === naturalWidth && layout.canvasHeight === naturalHeight) {
      return format;
    }
  }
  return null;
}

/**
 * Recolors the background/margin behind an already-flattened strip image —
 * NOT the photos themselves. Crop-and-stamps each slot's exact rectangle
 * from `image` onto a freshly `backgroundColor`-filled canvas at the same
 * position; margin pixels are never read from the source image, so this
 * can't leak the strip's previous background color at the edges.
 *
 * Sprocket holes are redrawn as an OPAQUE fill here (unlike
 * lib/compositor.ts#drawSprocketHoles's `destination-out` transparency) —
 * today's transparent holes only look right because Photostrip.tsx's `<img>`
 * happens to sit on a hardcoded `bg-film-black` CSS backdrop matching the
 * canvas's own default fill. Once the background is user-chosen, a
 * transparent hole would reveal whatever happens to be behind the exported
 * PNG in print/share/OG-image contexts, which is wrong — so this path always
 * bakes in a fixed, sensible dark hole color instead of relying on the
 * page's own accidental backdrop color.
 */
export function recolorStripBase(image: HTMLImageElement, backgroundColor: string): string {
  const format = inferStripFormat(image.naturalWidth, image.naturalHeight);
  if (!format) {
    throw new Error(
      `Cannot recolor strip: unrecognized image dimensions ${image.naturalWidth}x${image.naturalHeight}`
    );
  }

  const layout = computeStripLayout(format, "classic_bw", 1);

  const canvas = document.createElement("canvas");
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot recolor strip: 2D canvas context unavailable");
  }

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

  for (const slot of layout.slots) {
    ctx.drawImage(
      image,
      slot.x,
      slot.y,
      slot.width,
      slot.height,
      slot.x,
      slot.y,
      slot.width,
      slot.height
    );
  }

  drawOpaqueSprocketHoles(ctx, layout.canvasWidth, layout.canvasHeight);

  return canvas.toDataURL("image/png");
}

/** Fixed dark hole color — same geometry as lib/compositor.ts#drawSprocketHoles, but opaque instead of true transparency. See recolorStripBase's doc comment for why. */
const SPROCKET_HOLE_COLOR = "#141210";

function drawOpaqueSprocketHoles(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
): void {
  const xLeft = CANVAS_MARGIN / 2;
  const xRight = canvasWidth - CANVAS_MARGIN / 2;

  ctx.save();
  ctx.fillStyle = SPROCKET_HOLE_COLOR;
  for (let y = CANVAS_MARGIN / 2; y < canvasHeight; y += SPROCKET_HOLE_SPACING) {
    ctx.beginPath();
    ctx.arc(xLeft, y, SPROCKET_HOLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xRight, y, SPROCKET_HOLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
