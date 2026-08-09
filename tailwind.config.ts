import type { Config } from "tailwindcss";

// Palette, type, radius, border, and shadow tokens for the 3D-photobooth
// theme system (docs/goal-ui.md — classic sketch / neon cyberpunk / kawaii
// pastel). Every themeable value is a CSS custom property (defined per
// `[data-theme]` in app/globals.css) so switching themes re-paints every
// component built from these tokens without per-component JS. `rust`/
// `film-black` stay static: `rust` is unused (display-only reservation
// from the prior design brief) and `film-black` represents the physical
// photo-strip material itself, which stays near-black regardless of theme.
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
        // illuminated fills (bg-forest text-cream etc.), same dual role it
        // already played before theming: each theme's bg is chosen as the
        // legible contrast tone against that theme's forest/rust fills.
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
        // Serif/handwriting-ish display — marquee wordmark, screen headlines,
        // countdown text. Swaps per theme via --booth-font-display.
        display: ["var(--booth-font-display)", "Georgia", "Cambria", "serif"],
        // UI / instructional copy, buttons, labels. Swaps per theme via
        // --booth-font-sans.
        sans: [
          "var(--booth-font-sans)",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        // Card radius scale, still used by a few not-yet-themed surfaces.
        card: "12px",
        "card-lg": "16px",
        // Themed radius — 0 (classic) / 8px (neon) / 32px (kawaii).
        booth: "var(--booth-radius)",
      },
      borderWidth: {
        // 1px hairline, still used by a few not-yet-themed surfaces.
        hairline: "1px",
        // Themed outer border weight.
        booth: "var(--booth-border-width)",
        // Themed inner/decorative border weight (booth-shell chrome).
        "booth-inner": "var(--booth-border-width-inner)",
      },
      boxShadow: {
        // Themed shadow — hard offset (classic) / glow (neon) / soft (kawaii).
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
