import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
}

// Cream surface, 1px hairline structural-gray border, soft rounded corners,
// no drop shadow — design brief §2: "depth comes from the cream/gray
// contrast, not shadow."
const CARD_CLASSES =
  "rounded-card-lg border border-hairline border-structural-gray bg-cream shadow-none";

export default function Card({ children, className }: CardProps) {
  return (
    <div className={[CARD_CLASSES, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
