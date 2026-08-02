import type { Config } from "tailwindcss";

// Palette, type, radius, and border tokens per docs/online-photobooth-uiux-design-brief.md §2.
// Values are copied verbatim from the brief — do not invent new tokens here.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Page background / card surface.
        cream: "#e6e8f7",
        // Body text, near-black with a warm undertone.
        ink: "#2B2620",
        // Captions / instructions — muted taupe.
        "ink-secondary": "#6B6355",
        // Headlines, primary CTA outline — LARGE DISPLAY TYPE ONLY.
        // Brief §2: rust-on-cream fails AA at body size at this exact pair.
        rust: "#B14A26",
        // Body-size-safe rust for text/fills at component sizes (~6.3:1 on cream).
        "rust-body": "#8C3A1D",
        // Illuminated select/confirm, deep forest green (~8.8:1 on cream).
        forest: "#33422E",
        // Booth chrome, card borders, dividers.
        "structural-gray": "#DCD3C2",
        // The photostrip itself — stays near-true-black for contrast.
        "film-black": "#141210",
      },
      fontFamily: {
        // Serif, italic-capable — marquee wordmark, screen headlines, countdown text.
        display: ["var(--font-display)", "Georgia", "Cambria", "serif"],
        // Clean grotesque sans — UI, instructional copy, buttons, labels.
        sans: [
          "var(--font-sans)",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        // Card radius scale per brief §2 ("soft rounded corners, 12-16px").
        card: "12px",
        "card-lg": "16px",
      },
      borderWidth: {
        // 1px hairline used for card borders / dividers throughout the brief.
        hairline: "1px",
      },
    },
  },
  plugins: [],
};
export default config;
