"use client";

import { useEffect, useLayoutEffect, useState } from "react";

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

// This component is reached from server-rendered page shells, and a bare
// useLayoutEffect logs a "does nothing on the server" warning if reached
// during SSR — fall back to useEffect there; resolves to the real,
// before-paint useLayoutEffect in the browser, which is what the fix below
// depends on.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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

  useIsomorphicLayoutEffect(() => {
    if (targetTimestamp === null) return;
    // `now` is stale here on the first render after targetTimestamp flips
    // from null to a real epoch: it was captured back at mount, during
    // whatever null-target wait preceded this (e.g. the countdown election
    // or a camera-permission prompt), which the interval below never ran
    // during. Refreshing synchronously (pre-paint, via useLayoutEffect)
    // stops that staleness from inflating remainingMs enough to round
    // secondsRemaining up one extra second (e.g. a flash of "6" before a
    // 5s countdown).
    setNow(Date.now());
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
      <span className="font-display text-7xl text-white tabular-nums">
        {secondsRemaining > 0 ? secondsRemaining : "•"}
      </span>
      <span className="font-sans text-sm text-ink-secondary">
        {secondsRemaining > 0 ? "Get ready…" : "Capturing…"}
      </span>
    </div>
  );
}
