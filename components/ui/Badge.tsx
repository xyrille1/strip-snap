import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning";
}

// Real styling per status color lands in Step 4 Item 3.
export default function Badge({ children, variant = "default" }: BadgeProps) {
  void variant;
  return <span>{children}</span>;
}
