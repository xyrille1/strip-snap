import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning";
}

// "warning" uses the AA-safe body-size rust (#8C3A1D), not the
// display-only #B14A26 — badge text is component-size, not large display
// type (design brief §2's own AA warning; verified against test-plan A-01).
const VARIANT_CLASSES: Record<"default" | "success" | "warning", string> = {
  default: "border-structural-gray bg-cream text-ink",
  success: "border-forest bg-forest/10 text-forest",
  warning: "border-rust-body bg-rust-body/10 text-rust-body",
};

export default function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border-booth-inner px-2.5 py-0.5 text-xs font-medium font-sans ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
