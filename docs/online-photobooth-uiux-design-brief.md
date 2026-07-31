# Online Photobooth — UI/UX Design Brief

**Fusion concept: Analog Booth × Editorial Warmth**

The photobooth wireframes give us the _mechanics_ — a physical machine with a marquee, a console, a delivery slot, a printed strip. The travel-site reference gives us the _tone_ — cream backgrounds, an elegant serif voice, muted earth accents, generous whitespace. The fusion keeps every functional beat of the booth flow but strips out the hand-drawn/sketch skin and rebuilds it in that editorial language, so the product reads as a considered, warm digital object rather than a novelty kiosk simulator.

## 1. What we're taking from each reference

| From the booth wireframes (mechanics)                      | From the travel site (tone)                             | Fused decision                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Physical booth chrome, marquee sign, curtain, stool        | Cream background, generous negative space               | Keep the booth as a _motif_, not a literal illustration — implied through framing and a serif marquee wordmark, not line art |
| Numbered instruction strip (1/2/3)                         | FAQ accordion with hairline dividers, numbered rows     | Instructions become an editorial numbered list, same visual grammar as the FAQ                                               |
| Flat green "select" button, red "record" dot               | Dark forest-green CTA button, muted rust headline color | Illuminated buttons reskinned as soft-glow terracotta/forest circles, not flat clip-art dots                                 |
| Delivery slot with countdown, strip sliding out            | Editorial pacing, italic serif captions                 | Countdown becomes a quiet italic serif line; the slot reveal is the signature micro-interaction, polished not literal        |
| Hand-drawn "tag me" / hearts / sparkles on the final strip | Minimal outlined buttons, small caption typography      | Playful annotations survive as an optional sticker layer over an otherwise gallery-print presentation                        |
| B&W/color toggle switch                                    | —                                                       | Kept skeuomorphic (it's a nice tactile beat) but restyled in the warm palette                                                |

## 2. Design tokens

**Palette**

```
Background        #e6e8f7   warm cream (page bg, cards)
Ink                #2B2620   near-black, warm undertone (body text)
Ink secondary      #6B6355   muted taupe (captions, instructions)
Accent — primary   #B14A26   rust/terracotta (headlines, primary CTA outline)
Accent — select    #33422E   deep forest green (illuminated select button, confirm actions)
Structural gray    #DCD3C2   booth chrome, card borders, dividers
Film black         #141210   the photostrip itself — stays near-true-black for contrast
```

Note: rust-on-cream text fails AA at this exact pair — use `#B14A26` for large display type only; drop to a darker rust (~`#8C3A1D`) for body-size text on cream.

**Typography**

```
Display / marquee     Serif, italic for emphasis (e.g. "Photobooth", screen headlines, countdown text)
UI / instructional     Clean grotesque sans — buttons, numbered steps, labels
Numerals               Small-caps or serif figures for step numbers (01, 02, 03), echoing the FAQ row style
```

**Shape & elevation**

- Cards: soft rounded corners (12–16px), 1px hairline border in structural gray, no drop shadows — flat like the reference, depth comes from the cream/gray contrast, not shadow.
- Buttons: outlined pill or rounded-rect, never filled blocks except the single primary CTA per screen (forest green, matching Spots' submit button).

## 3. Screen-by-screen

### Landing (`/`)

Keep the "enter the booth" idea, drop the literal booth illustration. Serif italic wordmark at the top acting as the marquee. Below it, a horizontal filmstrip gallery of featured strips (the wireframe's "featured strips" panel), styled like the reference's photo collage — slightly overlapping, warm-toned. One primary CTA, "Enter the booth →", styled as the forest-green pill. Footer nav (Privacy, FAQ, About, Contact) stays minimal text links, matching the reference's top nav weight.

### Mode select / waiting room

New relative to the wireframes (from the PRD), but same visual grammar: numbered instruction card explaining solo vs. invite, cream card on cream page with a structural-gray border. Waiting room presence list styled as simple rows, not avatars-in-bubbles — keep it editorial, not app-generic.

### Capture setup (frame + style)

This is the console screen (image 2). Keep: eye-level arrow cue, left/right frame browse arrows, the "$0 = 4 pics" badge, the b&w/color toggle. Reskin: the frame preview sits in a cream card with a thin structural-gray frame (not a thick sketched bezel). The instruction strip becomes three numbered columns exactly like the reference's FAQ rows — numeral, hairline divider, short instruction. The physical "select" button becomes a soft radial-glow forest-green circle, centered below the frame.

### Live capture (take/upload photo)

Same console shell as above (image 3), swap the frame-browse content for "take photo" / "upload photo" as two outlined pill buttons stacked in the card. The red recording dot becomes a small pulsing rust-colored dot — same illuminated-button treatment, different color to signal "active" vs. "ready."

### Countdown & synced capture

Not shown in the wireframes directly but implied by the delivery-slot pacing — reuse that quiet, patient tone. Large serif italic countdown number, centered, no urgency-red styling; this is a shared, calm moment (matters especially for the LDR persona).

### Delivery / developing (images 4–5)

This is the signature interaction. Keep the literal metaphor — a slot, a strip sliding out, a countdown label ("Photos delivered here in N seconds") — but restyle the slot as a simple cream-and-taupe rounded frame instead of a mechanical illustration. As the countdown ticks down, the strip inside visually "develops" from faint gray to full color/contrast — ties the retro-darkroom idea into the editorial polish instead of relying on line-art machinery. "Pick up →" as the same forest-green pill CTA used elsewhere.

### Output / share (image 6)

Full strip displayed large, centered, on the cream background like a gallery print — this is the hero moment, give it the most whitespace on the whole site. The playful hand-drawn layer (hearts, sparkle marks, "tag me") survives as an _optional_ toggle-able sticker overlay, not baked into the default state — keeps the base experience polished while preserving the fun. Action row (download / share / print / restart) as four equal outlined pills, same weight as the reference's nav links — no button hierarchy here, all four are equally valid next steps.

## 4. Interaction notes

- **Illuminated button** is the recurring motif across screens (select, record, pick up) — always a soft-glow filled circle, color communicates state: forest green = confirm/select, rust = active/recording, never both on screen competing at once.
- **Slot reveal** is the one "wow" micro-interaction worth real animation budget — ease the strip up and out, with the develop-from-gray color transition. Everything else should be quiet and fast, not competing with this moment.
- **Numbered instruction rows** (steps 1/2/3, FAQ-style) are the connective tissue between the functional booth screens and the editorial marketing screens — reuse the same component everywhere instructions appear.

## 5. Responsive & accessibility

- Mobile-first: the primary audience (solo social-media users, LDR partners) is on phones. The console screens (frame preview, capture) should be full-bleed on mobile with the instruction strip collapsing to a single horizontal scroll row rather than three columns.
- Verify rust-on-cream and forest-green-on-cream text/icon combinations meet WCAG AA at the sizes actually used — flagged in §2, re-check once real components are built.
- Illuminated buttons need a non-color state indicator too (e.g. a ring or icon change) for color-blind users, since green/rust is the primary state signal.
