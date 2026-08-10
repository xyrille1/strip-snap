"use client";

export interface StickerOverlayProps {
  visible: boolean;
}

/**
 * Optional decorative sticker layer over the finished strip, per design
 * brief §3 ("Output / share"): hearts / sparkle marks / "tag me" survive as
 * an OPTIONAL toggle, off by default, so the default experience stays a
 * clean gallery print ("keeps the base experience polished while
 * preserving the fun"). Deliberately a small FIXED set of positioned
 * graphics, not an editor — no drag/resize/add-more affordances.
 *
 * Renders as an absolutely-positioned layer; the parent (e.g. the hero
 * image wrapper on the output/share screens) must be `position: relative`
 * for the stickers to align over the strip image rather than the page.
 * `print:hidden` — stickers are a screen-only flourish, never baked into
 * the self-print output.
 */
export default function StickerOverlay({ visible }: StickerOverlayProps) {
  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none print:hidden"
    >
      <HeartGlyph className="absolute -right-3 -top-3 h-10 w-10 rotate-6 text-rust-body" />
      <SparkleGlyph className="absolute -left-4 top-1/3 h-8 w-8 -rotate-12 text-forest" />
      <SparkleGlyph className="absolute bottom-6 right-6 h-6 w-6 rotate-12 text-rust-body" />
      <ScissorsGlyph className="absolute -bottom-4 -right-4 h-9 w-9 -rotate-[18deg] text-ink-secondary" />
      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 -rotate-2 rounded-full border-booth-inner border-ink bg-cream px-3 py-1 font-display text-xs text-ink">
        tag me →
      </span>
    </div>
  );
}

function HeartGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 21s-6.7-4.3-9.3-8.1C.9 10.2 1.6 6.6 4.7 5.2c2.1-.9 4.4-.2 5.8 1.5l1.5 1.8 1.5-1.8c1.4-1.7 3.7-2.4 5.8-1.5 3.1 1.4 3.8 5 2 7.7C18.7 16.7 12 21 12 21z" />
    </svg>
  );
}

function SparkleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
    </svg>
  );
}

/** Nods to the physical "cut your strip apart" ritual (design brief §3's filmstrip motif) — a quiet analog detail, not a functional cut control. */
function ScissorsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5L20 19M8 16.5L20 5" strokeLinecap="round" />
    </svg>
  );
}
