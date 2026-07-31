"use client";

export interface ReadyToggleProps {
  isReady: boolean;
  onToggle: () => void;
}

// Real status update (participant status + presence track) lands in Step 4 Item 4.
export default function ReadyToggle({ isReady, onToggle }: ReadyToggleProps) {
  return <button onClick={onToggle}>{isReady ? "Ready" : "Not ready"}</button>;
}
