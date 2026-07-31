import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
}

// Real surface styling (borders, shadow, tinted background) lands in Step 4 Item 3.
export default function Card({ children, className }: CardProps) {
  return <div className={className}>{children}</div>;
}
