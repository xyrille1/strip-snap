"use client";

import { useEffect, useState } from "react";

export interface CountdownProps {
  /**
   * Epoch ms, on THIS client's own local clock, that capture is scheduled
   * to fire at — already clock-offset-corrected by lib/countdownSync.ts
   * from the broadcast's `serverTimestamp` (never the raw server value, and
   * never a value derived from broadcast-receipt time).
   */
  targetTimestamp: number | null;
}

const TICK_MS = 100;

/**
 * Renders a live countdown against `targetTimestamp`. Purely a display
 * concern — this component never triggers capture itself (that stays in
 * lib/countdownSync.ts's own `setTimeout`, per TRD §3); it just re-renders
 * on an interval to show the remaining seconds ticking down.
 *
 * Hand-drawn numeral, ink/ink-secondary tones only — design brief's
 * "quiet, patient tone... no urgency-red styling" for the countdown moment.
 */
export default function Countdown({ targetTimestamp }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetTimestamp === null) return;
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [targetTimestamp]);

  if (targetTimestamp === null) {
    return (
      <p className="font-sans text-sm text-ink-secondary">Waiting to start</p>
    );
  }

  const remainingMs = Math.max(0, targetTimestamp - now);
  const secondsRemaining = Math.ceil(remainingMs / 1000);

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label="Countdown to capture"
    >
      <span className="font-display text-7xl text-ink tabular-nums">
        {secondsRemaining > 0 ? secondsRemaining : "•"}
      </span>
      <span className="font-sans text-sm text-ink-secondary">
        {secondsRemaining > 0 ? "Get ready…" : "Capturing…"}
      </span>
    </div>
  );
}
