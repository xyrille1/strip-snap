"use client";

export interface CountdownProps {
  /** Epoch ms from the `countdown_start` broadcast; capture must fire at this timestamp, not on receipt. */
  targetTimestamp: number | null;
}

// Real server-timestamp scheduling lands in Step 4 Item 5.
export default function Countdown({ targetTimestamp }: CountdownProps) {
  return <div>{targetTimestamp ? "Counting down…" : "Waiting to start"}</div>;
}
