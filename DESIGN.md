# Strip Snap — Design Notes

Source of truth for the *look* is `docs/goal-ui.md`'s "Classic Sketch" theme;
`docs/online-photobooth-uiux-design-brief.md` still governs *structure* (what
each screen contains, the a11y rules, the copy voice). This file records the
tokens/decisions layered on top and why, so future sessions don't drift or
re-litigate settled choices.

## Aesthetic direction

**Classic Sketch** — the 3D photobooth is the design language of the entire
site, not a widget inside it. Off-white paper background, white panels, heavy
black outlines, zero corner radius, and a hard offset drop-shadow
(`6px 6px 0 0 #000`) that makes every surface read as a drawn, cut-out object.
Nothing blurs: there are no soft shadows or glows anywhere, because a blur
breaks the "drawn on paper" illusion the whole look rests on.

The booth shell (`BoothFrame`) appears on the landing page, mode select,
waiting room, capture, preview, style, and the developing reveal — so a
visitor is inside the booth from the first screen to the last. Output and the
public share page are the deliberate exception: they drop the shell so the
finished strip gets the most whitespace on the site (brief §3's "signature
moment"), carrying the sketch look via `Photostrip`'s own chrome instead.

Tone stays quiet and patient: no urgency-red, no bounce/elastic motion.

## Tokens

Colors/border/radius/shadow are CSS custom properties in `app/globals.css`'s
`:root`, which `tailwind.config.ts` points at. There is exactly **one** theme —
the vars are an indirection so every booth-shell component shares one token
set, not a runtime theme switcher. (An earlier pass shipped a three-theme
system — classic / neon cyberpunk / kawaii pastel — with a `ThemeSelector`;
that was removed. Don't reintroduce per-theme branching without also bringing
back a way to switch.)

- **Color**: `cream` (#F5F6F8 paper bg, and the on-accent text tone),
  `panel` (#FFFFFF card/panel surface), `screen` (#111111 console bezel),
  `ink` (#2B2620 body text), `ink-secondary` (#6B6355 captions),
  `structural-gray` (#000000 — the heavy sketch outline; the name is
  historical, it is pure black now), `forest` (#33422E confirm/select),
  `rust-body` (#8C3A1D accent/eyebrow labels), `film-black` (#141210, the
  strip's own material). `rust` (#B14A26) is reserved and currently unused.
- **Type**: `font-display` = **Architects Daughter** (hand-drawn) for the
  wordmark, screen headlines, countdown numerals, eyebrow labels.
  `font-sans` = Space Grotesk for UI copy, buttons, labels.
- **Border**: `border-booth` (3px outer), `border-booth-inner` (2px
  decorative/inner). The old `hairline` (1px) and `card`/`card-lg` radii were
  removed once nothing referenced them — a stray rounded corner or thin rule
  reads as a bug against this look.
- **Radius**: `rounded-booth` = 0. Pills (`rounded-full`) remain for buttons
  only, as the one intentional soft shape.
- **Shadow**: `shadow-booth` = hard offset, no blur.
- **Motion**: `animate-fade-up` for screen headers; `BoothFrame`'s 1s 3D pose
  swing. Both disabled under `prefers-reduced-motion` (`globals.css` —
  the booth transition is suppressed via the `.booth-pose` class, since a
  media query can't override an inline `transform`).

### Two traps that already bit us

- **Architects Daughter has no italic and no bold face.** Never put `italic`
  on a `font-display` element — the browser synthesizes a skewed oblique that
  looks like a rendering bug on a handwriting face. 29 such usages were
  removed when the font changed. Carry emphasis with size/color instead.
- **Tailwind resolves conflicts by stylesheet order, not class order.**
  Passing `className="bg-forest text-cream"` to `<Button variant="default">`
  does *not* override the variant's `bg-transparent`/`text-ink` — it silently
  renders as a plain outlined button. Three screens shipped their primary CTA
  that way. Use `<Button variant="primary">`; don't re-open this by patching
  colors through `className`.

## Components

- `Button` — outlined pill (`default`), filled forest pill (`primary`, the one
  permitted filled CTA per screen), or `illuminated` circular select/record
  motif with a non-color active glyph for colorblind-safe state.
- `CtaLink` — the `<a>` counterpart to `variant="primary"`, for navigation.
- `Card` — white panel, 3px black outline, radius 0, hard offset shadow.
- `BoothFrame` — the 3D triptych: decorative left/right panels flanking a
  center slot that holds the screen's real content. Panels hide below `lg:`,
  so every screen using it needs an `lg:hidden` fallback carrying the
  full-detail instructions (see `CaptureClient`, the landing page).
- `ScreenConsole` — the booth's camera console (status light, black bezel,
  control deck). Used by capture and by preview's retake.
- `SketchFilmstrip` — drawn, empty filmstrip for the landing hero. Replaced a
  `picsum.photos` collage that put a third-party network dependency on the
  front door and showed stock photos as if they were user output.
- `Photostrip` — floating tilted frame around the finished strip.
- `NumberedList` — instruction rows; `vertical` default, `columns` for the
  scroll-snap mobile instruction strip.

## The strip itself (lib/compositor.ts)

**Do not restyle this from CSS — it's canvas geometry, and it's load-bearing.**

- Slot aspect is 3:4 portrait (`SLOT_WIDTH` 360 / `SLOT_HEIGHT` 480), matching
  `lib/captureResolution.ts`'s 720×960 cap and every `aspect-[3/4]` camera
  surface. It was briefly 480×360 (landscape), which visibly stretched every
  portrait photo — fixed 2026-08-06.
- `drawStrip` uses `drawImageCover` (crop-to-fill), not stretch-to-fit. That's
  the real guard against distortion, holding even when a webcam's native
  aspect isn't exactly 3:4.
- `drawSprocketHoles` punches real transparency down both margins.
- `computeSubRegions` splits each slot by participant count: 1 = full slot,
  2 = two half-width full-height columns, 3+ = a grid. Two separate
  duplicate-participant bugs (solo, then invite) once inflated this count and
  rendered part-black grids — `QA-FINDINGS.md` has the details. Any change
  near participant identity should re-assert: solo = 1 row, 2-person invite =
  2 rows.
- `StripPreview` accepts a `className` for the film-black frame so callers can
  bound its **height** — a strip is roughly 1:3.7, so sizing on width alone
  renders it ~1300px tall and pushes the screen off the fold.

## Known intentional gaps

- No "upload an existing photo" alternative to live capture. The capture flow
  is built around a server-anchored synced countdown across every participant
  (`lib/countdownSync.ts`); an async upload path has no obvious place in that
  model without changing session semantics.
- `app/fonts/` still holds the unused `GeistVF.woff` / `GeistMonoVF.woff` from
  the create-next-app template (~134KB, referenced by nothing).

Last updated: 2026-08-10.
