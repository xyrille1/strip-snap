"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export interface PhotostripProps {
  src: string;
  alt: string;
  /** Rendered over the strip image (e.g. StickerOverlay) — needs the same relative-positioned wrapper the strip sits in. */
  overlay?: ReactNode;
  className?: string;
}

/**
 * Floating, slightly-tilted photostrip frame (docs/goal-ui.md's Photostrip /
 * the "result" reveal) — wraps the app's own single composited strip image
 * (from lib/compositor.ts, already laid out with sprocket holes/frame) in a
 * mat + themed border + shadow, with a click-to-flip tilt like the
 * reference. The reference composites 4 raw shots client-side into this
 * component; this app already has one finished image by the time it reaches
 * output/share, so this just frames it rather than re-compositing.
 */
export default function Photostrip({ src, alt, overlay, className }: PhotostripProps) {
  const [rotation, setRotation] = useState(-3);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Tilt the photo strip"
      onClick={() => setRotation((prev) => (prev === -3 ? 3 : -3))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setRotation((prev) => (prev === -3 ? 3 : -3));
        }
      }}
      className={[
        "relative mx-auto block w-full max-w-sm cursor-pointer p-3 bg-panel border-booth border-structural-gray rounded-booth shadow-booth transition-transform duration-700 hover:scale-[1.02] print:transform-none print:shadow-none print:border-0 print:p-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static/optimizable asset. */}
      <img src={src} alt={alt} className="block w-full rounded-[4px] bg-film-black p-2" />
      {overlay}
    </div>
  );
}
