"use client";

export interface StripPreviewProps {
  imageUrl: string | null;
}

// Real Canvas-composited preview (lib/compositor.ts) lands in Step 4 Item 7.
export default function StripPreview({ imageUrl }: StripPreviewProps) {
  return <div>{imageUrl ? "Strip preview placeholder" : "No strip yet"}</div>;
}
