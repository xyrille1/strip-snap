import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
}

// Panel surface in the booth's own chrome (tailwind.config.ts /
// app/globals.css): white panel, heavy black outline, zero radius, and the
// hard offset shadow that gives the "Classic Sketch" look its drawn, cut-out
// feel (docs/goal-ui.md). Every card on the site is a piece of the booth.
const CARD_CLASSES =
  "rounded-booth border-booth border-structural-gray bg-panel shadow-booth";

export default function Card({ children, className }: CardProps) {
  return (
    <div className={[CARD_CLASSES, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
