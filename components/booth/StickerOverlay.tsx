"use client";

export interface StickerOverlayProps {
  visible: boolean;
}

// Real sticker/decoration overlay wiring lands alongside Step 4 Item 8 output polish.
export default function StickerOverlay({ visible }: StickerOverlayProps) {
  if (!visible) return null;
  return <div>Sticker overlay placeholder</div>;
}
