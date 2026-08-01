export interface PermissionFallbackProps {
  reason: "denied" | "unsupported" | "pending";
}

// Real copy + retry affordance lands in Step 4 Item 5 (functional) and Item 10 (polish).
export default function PermissionFallback({ reason }: PermissionFallbackProps) {
  return <div>Camera unavailable ({reason}).</div>;
}
