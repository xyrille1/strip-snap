/**
 * Curated sticker set for the strip editor (components/booth/StripEditor.tsx).
 * Standalone SVG markup strings (not React components) so they can be loaded
 * directly into a Fabric canvas via `fabric.loadSVGFromString` — unlike the
 * inline `<svg>` glyph functions in the old components/booth/StickerOverlay.tsx
 * (now deleted), these can't rely on Tailwind `text-*` classes for color
 * (`currentColor` has no meaning once parsed standalone by Fabric's SVG
 * parser), so each path bakes in a fixed fill hex instead.
 *
 * Heart and sparkle are the same paths StickerOverlay.tsx used to render
 * (`HeartGlyph`/`SparkleGlyph`) — carried over rather than redrawn, so the
 * shapes stay visually consistent with the app's prior sticker treatment.
 * Star is new, added so the curated set reads richer than just two glyphs.
 */
export interface Sticker {
  id: string;
  label: string;
  svgMarkup: string;
}

export const STICKERS: Sticker[] = [
  {
    id: "heart",
    label: "Heart",
    svgMarkup:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#8c3a1d" d="M12 21s-6.7-4.3-9.3-8.1C.9 10.2 1.6 6.6 4.7 5.2c2.1-.9 4.4-.2 5.8 1.5l1.5 1.8 1.5-1.8c1.4-1.7 3.7-2.4 5.8-1.5 3.1 1.4 3.8 5 2 7.7C18.7 16.7 12 21 12 21z"/></svg>',
  },
  {
    id: "sparkle",
    label: "Sparkle",
    svgMarkup:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#33422e" d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>',
  },
  {
    id: "star",
    label: "Star",
    svgMarkup:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#2b2620" d="M12 2.5l2.7 5.9 6.4.7-4.8 4.4 1.3 6.3L12 16.8l-5.6 3 1.3-6.3-4.8-4.4 6.4-.7L12 2.5z"/></svg>',
  },
];
