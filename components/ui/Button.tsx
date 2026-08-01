import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "illuminated";
  children?: ReactNode;
}

/**
 * Real styling — including the "illuminated" ready-state variant from the
 * design brief — lands with the Tailwind tokens in Step 4 Item 3.
 */
export default function Button({
  variant = "default",
  children,
  ...props
}: ButtonProps) {
  void variant;
  return <button {...props}>{children}</button>;
}
