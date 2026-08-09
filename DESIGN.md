# Strip Snap — Design Notes

Source of truth for visual decisions is `docs/online-photobooth-uiux-design-brief.md`.
This file tracks the small set of tokens/decisions layered on top of it and
why, so future sessions don't drift or re-litigate settled choices.

## Aesthetic direction

Warm editorial / vintage photobooth. Serif italic display type for
headlines and countdown moments, clean grotesque sans for UI copy. Cream
paper background, near-black film-strip chrome for the strip itself. No drop
shadows anywhere — depth comes from the cream/gray contrast, not shadow
(brief §2). Quiet, patient tone; no urgency-red, no bounce/elastic motion.

## Tokens (tailwind.config.ts)

- Color: `cream` (#e6e8f7 bg/surface), `ink` (#2B2620 body text), `ink-secondary`
  (#6B6355 captions), `rust` (#B14A26, display-size only — fails AA at body
  size) / `rust-body` (#8C3A1D, AA-safe at component size), `forest`
  (#33422E, confirm/select), `structural-gray` (#DCD3C2, chrome/borders),
  `film-black` (#141210, the strip's own background).
- Type: `font-display` = Playfair Display (italic-capable serif) for
  headlines/countdown/marquee. `font-sans` = Space Grotesk for UI/buttons/labels.
- Radius: `card` 12px, `card-lg` 16px. Border: `hairline` 1px.
- Motion: `animate-fade-up` (opacity + 8px translateY, 0.5s ease-out) —
  applied only to screen headers/heroes, never to interactive controls.
  Disabled under `prefers-reduced-motion` (globals.css).

## Components

- `Button` — outlined pill by default (never a filled block); `illuminated`
  circular variant for the select/record/pick-up motif (forest = confirm,
  rust = active), with a non-color active glyph for colorblind-safe state.
- `Card` — cream surface, hairline border, no shadow.
- `CtaLink` — the one filled-block exception per screen (forest glow), for
  the single primary CTA.

## The strip itself (lib/compositor.ts)

- Slot aspect is 3:4 portrait (`SLOT_WIDTH` 360 / `SLOT_HEIGHT` 480) —
  matches the capture pipeline's own aspect (`lib/captureResolution.ts`'s
  720×960 cap) and every camera/preview surface's `aspect-[3/4]` CSS. This
  was previously 480×360 (landscape 4:3), a mismatch that visibly stretched
  every portrait photo into a wider box — fixed 2026-08-06.
- `drawStrip` draws each image via `drawImageCover` (crop-to-fill, like CSS
  `object-fit: cover`), not a plain stretch-to-fit `drawImage`. This is the
  actual guard against distortion — it holds even if a given webcam's native
  aspect isn't exactly 3:4, not just when the layout constants happen to match.
- `drawSprocketHoles` punches real transparency (`destination-out`) down both
  margins after the images are drawn — the physical filmstrip detail. Reads
  correctly regardless of what the strip is later composited over.
- `StickerOverlay` (screen-only, opt-in via the "Add stickers" toggle) adds
  the decorative flourishes: heart, sparkles, a scissors mark (nod to
  "cut your strip apart"), and a "tag me →" callout. Off by default so the
  base experience stays a clean gallery print.

## Known intentional gaps (not addressed in this pass)

- No "upload an existing photo" alternative to live capture. The capture
  flow is built around a server-anchored synced countdown across every
  participant in a session (`lib/countdownSync.ts`) — an async upload path
  doesn't have an obvious place in that synchronization model without
  changing session semantics, so it was left out rather than bolted on.

Last updated: 2026-08-06.
