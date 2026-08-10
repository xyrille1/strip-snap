"use client";

import { STYLE_PRESETS } from "@/lib/validation/strip";

export interface StylePickerProps {
  selected: (typeof STYLE_PRESETS)[number] | null;
  onSelect: (preset: (typeof STYLE_PRESETS)[number]) => void;
}

/** Human-readable label per preset, editorial numbered-row voice (design brief §2/§3). */
const PRESET_LABEL: Record<(typeof STYLE_PRESETS)[number], string> = {
  classic_bw: "Classic B&W",
  sepia: "Sepia",
  vintage_warm: "Vintage warm",
  high_contrast_mono: "High contrast mono",
};

/**
 * Small CSS-`filter`-only swatch per preset — a lightweight stand-in for a
 * real photographic thumbnail. A true photo thumbnail would need an actual
 * captured frame to render against (this component has no shot data passed
 * to it, by design — StyleClient owns that and renders the real Canvas
 * preview via StripPreview), so a flat swatch tinted with the SAME
 * `lib/compositor.ts#STYLE_FILTERS` treatment (approximated in CSS here) is
 * the honest amount of visual signal for a preset *picker* row, while the
 * actual live strip preview lives in StripPreview. Documented per the task
 * brief's "your call" on thumbnail scope.
 */
const SWATCH_FILTER: Record<(typeof STYLE_PRESETS)[number], string> = {
  classic_bw: "grayscale(100%)",
  sepia: "sepia(100%)",
  vintage_warm: "sepia(35%) saturate(140%) contrast(105%) brightness(105%)",
  high_contrast_mono: "grayscale(100%) contrast(150%)",
};

export default function StylePicker({ selected, onSelect }: StylePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Style preset"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {STYLE_PRESETS.map((preset) => {
        const isSelected = preset === selected;
        return (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(preset)}
            className={[
              "flex flex-col items-center gap-2 rounded-booth border-booth-inner p-3 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-ink",
              isSelected
                ? "border-forest bg-forest/10"
                : "border-structural-gray bg-cream hover:border-ink-secondary",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="h-12 w-12 rounded-booth border-booth-inner border-structural-gray bg-film-black"
              style={{ filter: SWATCH_FILTER[preset], backgroundColor: "#8C3A1D" }}
            />
            <span className="font-sans text-xs font-medium text-ink">
              {PRESET_LABEL[preset]}
            </span>
            {/* Non-color state indicator (test-plan A-02 parity): a checkmark
                glyph, not just the border/background color change above. */}
            {isSelected ? (
              <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" className="text-forest">
                <path
                  d="M3 8.5L6.5 12L13 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
