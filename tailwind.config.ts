import type { Config } from "tailwindcss";

// Palette, type, radius, border, and shadow tokens for the "Classic Sketch"
// 3D-photobooth look (docs/goal-ui.md): off-white paper, thick black
// borders, hard offset shadow, radius-0 chrome. Colors/border/radius/shadow
// are CSS custom properties (app/globals.css's `:root`) rather than plain
// hex purely so every booth-shell component shares one token set — there is
// one token set. `rust`/`film-black` stay static hex: `rust` is unused
// (display-only reservation from the prior design brief) and `film-black`
// represents the physical photo-strip material itself.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Page background — also doubles as the "on-accent" text color for
        // illuminated fills (bg-forest text-cream etc.), since it's the
        // legible contrast tone against the forest/rust fills.
        cream: "var(--booth-bg)",
        // Card/panel surface — distinct from the page background.
        panel: "var(--booth-panel)",
        // Console/screen bezel background (the camera/countdown screen).
        screen: "var(--booth-screen)",
        // Body text.
        ink: "var(--booth-ink)",
        // Captions / instructions — muted secondary tone.
        "ink-secondary": "var(--booth-ink-secondary)",
        // Reserved display-only rust (unused currently — see file doc comment).
        rust: "#B14A26",
        // Illuminated "active/recording" fill + caption accent.
        "rust-body": "var(--booth-rust)",
        // Illuminated "confirm/select" fill.
        forest: "var(--booth-forest)",
        // Booth chrome — card/button borders, dividers.
        "structural-gray": "var(--booth-border)",
        // The photostrip itself — stays near-true-black for contrast,
        // representing the physical film material regardless of theme.
        "film-black": "#141210",
      },
      fontFamily: {
        // Hand-drawn — marquee wordmark, screen headlines, countdown text.
        // Fallbacks stay in the same casual-handwriting register as
        // Architects Daughter (app/layout.tsx) so a font-load failure
        // degrades to something still sketch-like rather than a serif.
        display: ["var(--font-display)", "Segoe Print", "Bradley Hand", "cursive"],
        // UI / instructional copy, buttons, labels.
        sans: [
          "var(--font-sans)",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        // Booth-shell radius (0 — sharp corners, per the sketch look). The
        // old `card`/`card-lg` 12/16px scale is gone: every surface is booth
        // chrome now, and a stray rounded corner reads as a bug against it.
        booth: "var(--booth-radius)",
      },
      borderWidth: {
        // Booth-shell outer border weight (the heavy sketch outline).
        booth: "var(--booth-border-width)",
        // Booth-shell inner/decorative border weight.
        "booth-inner": "var(--booth-border-width-inner)",
      },
      boxShadow: {
        // Booth-shell hard offset shadow.
        booth: "var(--booth-shadow)",
      },
      keyframes: {
        // Quiet entrance for screen headers/heroes — opacity + a small
        // translate only (never width/height/color), matching the brief's
        // "quiet, patient tone" rather than a flashy/bouncy reveal. Disabled
        // under `prefers-reduced-motion` in globals.css.
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
