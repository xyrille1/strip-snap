"use client";

/**
 * Local rapid-fire capture burst, run once the single synced countdown
 * trigger fires (lib/countdownSync.ts). Per the PRD's "Login gate note"
 * (docs/online-photobooth-flows.md §3): the 3-vs-4-photo format decision
 * happens later, at "generate strip" — capture itself happens *before*
 * format is chosen, so it can't be format-aware. Every capture always takes
 * the maximum photo count; `generate` later decides how many of them get
 * composited (free tier = first 3, upgraded = all 4).
 *
 * Only shot 0 is timing-critical — it's captured synchronously, at the
 * exact server-anchored instant lib/countdownSync.ts already scheduled.
 * Shots 1-3 are purely local rapid-fire follow-ups (a real photobooth's
 * "3-2-1" then several quick flashes), not re-run through the
 * jitter/election/broadcast dance — doing that per shot would take
 * ~4x the countdown lead time and feel nothing like a real photobooth.
 */

export const MAX_PHOTOS = 4;

/**
 * Fixed interval (ms) between each rapid-fire shot after the first. Picked
 * from the middle of the requested 800-1200ms range: fast enough to read as
 * a genuine "burst" rather than four separate countdowns, slow enough that
 * (a) the subject can register each flash and adjust pose slightly, and (b)
 * the previous shot's JPEG encode + broadcastShot call has realistic room to
 * finish before the next frame is captured, avoiding backpressure on the
 * Realtime channel.
 */
export const BURST_INTERVAL_MS = 900;

export interface CaptureBurstDeps {
  /**
   * Captures one frame right now and returns its data URL, or `null` if a
   * frame genuinely can't be captured (e.g. the video element is gone,
   * component unmounted mid-burst). Synchronous — Canvas 2D's `toDataURL`
   * has no async variant, so this stays true to how it's actually called.
   */
  captureFrame: (shotIndex: number) => string | null;
  /** Relays one captured shot. shotIndex is NOT the same as the synced countdown_start — it only orders shots within this participant's own burst. */
  broadcastShot: (shotIndex: number, dataUrl: string) => Promise<void>;
  /** Local bookkeeping hook (e.g. filling CaptureClient's shotsRef, updating UI state) — fired per shot, right after capture and before its broadcast is awaited. */
  onShotCaptured?: (shotIndex: number, dataUrl: string) => void;
  /** Injectable timer — tests only. Defaults to the global setTimeout. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface CaptureBurstCallbacks {
  /**
   * Fires exactly once, only after all `maxPhotos` shots have been captured
   * and their broadcasts have settled (resolved or rejected — a single failed
   * send must never hang the whole burst). This is the only point at which
   * the caller should broadcast `capture_ack` / mark presence `"captured"` —
   * never after shot 0 alone.
   */
  onComplete: () => void;
}

export interface CaptureBurstOptions {
  intervalMs?: number;
  maxPhotos?: number;
}

export interface CaptureBurstHandle {
  /** Cancels any not-yet-fired shots in the burst (shot 0 has already happened by the time this handle is returned). */
  stop: () => void;
}

export function runCaptureBurst(
  deps: CaptureBurstDeps,
  callbacks: CaptureBurstCallbacks,
  options: CaptureBurstOptions = {}
): CaptureBurstHandle {
  const intervalMs = options.intervalMs ?? BURST_INTERVAL_MS;
  const maxPhotos = options.maxPhotos ?? MAX_PHOTOS;
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;

  let stopped = false;
  let completedCount = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  function noteShotDone() {
    completedCount += 1;
    if (completedCount === maxPhotos) callbacks.onComplete();
  }

  function captureAndBroadcast(shotIndex: number) {
    if (stopped) return;

    const dataUrl = deps.captureFrame(shotIndex);
    if (dataUrl === null) {
      // No frame available (e.g. unmounted mid-burst) — still counts toward
      // completion so a missing frame can never hang the burst forever.
      noteShotDone();
      return;
    }

    deps.onShotCaptured?.(shotIndex, dataUrl);
    void deps
      .broadcastShot(shotIndex, dataUrl)
      .catch((err) => {
        console.error(
          `[captureBurst] broadcastShot failed for shotIndex ${shotIndex}`,
          err
        );
      })
      .finally(() => {
        noteShotDone();
      });
  }

  // Shot 0 fires immediately/synchronously — this preserves the precise
  // server-anchored timing lib/countdownSync.ts already scheduled; nothing
  // in this module adds delay before it.
  captureAndBroadcast(0);

  // Shots 1..N-1 are scheduled with delays cumulative from burst start
  // (intervalMs * shotIndex), not chained off the previous shot's async
  // completion — keeps each shot's timing independent of how long the prior
  // shot's capture/broadcast took, avoiding compounding drift.
  for (let shotIndex = 1; shotIndex < maxPhotos; shotIndex += 1) {
    const timer = setTimeoutFn(() => {
      captureAndBroadcast(shotIndex);
    }, intervalMs * shotIndex);
    timers.push(timer);
  }

  return {
    stop() {
      stopped = true;
      timers.forEach((timer) => clearTimeoutFn(timer));
    },
  };
}
