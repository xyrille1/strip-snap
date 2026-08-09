import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
}

// Themed panel surface — booth-shell tokens (tailwind.config.ts /
// app/globals.css): border weight, radius, and shadow all swap per theme
// (docs/goal-ui.md's classic/neon/kawaii), from a hard offset shadow to a
// glow to a soft drop shadow.
const CARD_CLASSES =
  "rounded-booth border-booth border-structural-gray bg-panel shadow-booth";

export default function Card({ children, className }: CardProps) {
  return (
    <div className={[CARD_CLASSES, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
