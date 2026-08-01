"use client";

import { STYLE_PRESETS } from "@/lib/validation/strip";

export interface StylePickerProps {
  selected: (typeof STYLE_PRESETS)[number] | null;
  onSelect: (preset: (typeof STYLE_PRESETS)[number]) => void;
}

// Real preset thumbnails + compositor preview wiring lands in Step 4 Item 7.
export default function StylePicker({ selected, onSelect }: StylePickerProps) {
  return (
    <div>
      {STYLE_PRESETS.map((preset) => (
        <button key={preset} onClick={() => onSelect(preset)}>
          {preset === selected ? `${preset} (selected)` : preset}
        </button>
      ))}
    </div>
  );
}
