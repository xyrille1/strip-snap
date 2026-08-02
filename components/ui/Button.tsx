import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * "default": outlined pill, per design brief §2 — "never filled blocks
   * except the single primary CTA per screen."
   * "illuminated": soft-glow filled circle, the recurring select/record/
   * pick-up motif from design brief §4.
   */
  variant?: "default" | "illuminated";
  /**
   * Illuminated-only. forest = confirm/select, rust = active/recording
   * (design brief §4). Color-configurable by design — callers are
   * responsible for never showing both forest and rust illuminated
   * buttons active on the same screen at once (brief §4).
   */
  color?: "forest" | "rust";
  /**
   * Illuminated-only. Design brief §5 / test-plan A-02: illuminated
   * buttons need a non-color state indicator, since color alone can't be
   * the only signal for colorblind users. When true, renders a visible
   * outer ring *and* an inner checkmark glyph — a shape-based signal
   * that's independent of the fill color.
   */
  active?: boolean;
  children?: ReactNode;
}

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 font-sans transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-ink disabled:opacity-50 disabled:cursor-not-allowed";

// Outlined pill — never a filled block (design brief §2).
const DEFAULT_CLASSES =
  "rounded-full border border-hairline border-ink bg-transparent px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink hover:text-cream";

// Illuminated fills use the AA-safe body-size rust (#8C3A1D), not the
// display-only #B14A26, since this fill sits under component-size
// icons/labels rather than large display type (design brief §2's own AA
// warning; verified against test-plan A-01).
const ILLUMINATED_COLOR_CLASSES: Record<"forest" | "rust", string> = {
  forest: "bg-forest text-cream shadow-[0_0_20px_2px_rgba(51,66,46,0.35)]",
  rust: "bg-rust-body text-cream shadow-[0_0_20px_2px_rgba(140,58,29,0.35)]",
};

const ILLUMINATED_ACTIVE_RING: Record<"forest" | "rust", string> = {
  forest: "ring-4 ring-offset-2 ring-offset-cream ring-forest",
  rust: "ring-4 ring-offset-2 ring-offset-cream ring-rust-body",
};

const ILLUMINATED_INACTIVE_RING = "ring-1 ring-offset-2 ring-offset-cream ring-structural-gray";

/**
 * Non-color state glyph for the illuminated variant (test-plan A-02).
 * Rendered only when `active` is true, independent of fill color, so the
 * state change is legible without relying on hue.
 */
function ActiveGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className="pointer-events-none"
    >
      <path
        d="M3 8.5L6.5 12L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Button({
  variant = "default",
  color = "forest",
  active = false,
  className,
  children,
  ...props
}: ButtonProps) {
  if (variant === "illuminated") {
    return (
      <button
        type="button"
        {...props}
        aria-pressed={active}
        className={[
          BASE_CLASSES,
          "relative h-16 w-16 rounded-full",
          ILLUMINATED_COLOR_CLASSES[color],
          active ? ILLUMINATED_ACTIVE_RING[color] : ILLUMINATED_INACTIVE_RING,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {active ? <ActiveGlyph /> : null}
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      {...props}
      className={[BASE_CLASSES, DEFAULT_CLASSES, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

// Filled forest-green pill — the "single primary CTA per screen" treatment
// design brief §2 permits beyond the outlined-pill default ("never filled
// blocks except the single primary CTA per screen (forest green"). Distinct
// from the illuminated *circle* variant above (§4's select/record/pick-up
// motif is icon-sized and fixed-circle; a labeled CTA like "Enter the
// booth →" needs to size to its text).
const CTA_CLASSES =
  "rounded-full bg-forest text-cream px-8 py-3.5 text-base font-semibold shadow-[0_0_24px_4px_rgba(51,66,46,0.3)] hover:bg-forest/90";

export interface CtaLinkProps {
  href: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Primary-CTA *navigation* link styled with the same forest-glow treatment
 * as the illuminated button. Renders a real `<a>` (via next/link), not a
 * `<button>` wrapped in a link — a `<button>` is not valid content inside an
 * `<a>` per the HTML interactive-content model, and this component's whole
 * job is navigation (e.g. landing page's "Enter the booth →" → /session/new).
 */
export function CtaLink({ href, className, children }: CtaLinkProps) {
  return (
    <Link
      href={href}
      className={[BASE_CLASSES, CTA_CLASSES, className].filter(Boolean).join(" ")}
    >
      {children}
    </Link>
  );
}
