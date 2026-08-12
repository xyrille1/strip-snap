"use client";

/**
 * Per-shot capture sequence, run once the single synced countdown election
 * (lib/countdownSync.ts) hands off round 0's target. Per the PRD's "Login
 * gate note" (docs/online-photobooth-flows.md §3): the 3-vs-4-photo format
 * decision happens later, at "generate strip" — capture itself happens
 * *before* format is chosen, so it can't be format-aware. Every capture
 * always takes the maximum photo count; `generate` later decides how many
 * of them get composited (free tier = first 3, upgraded = all 4).
 *
 * EVERY shot is timing-critical, not just shot 0: the group picks a single
 * per-shot countdown duration (`leadMs`, 5s or 10s — lib/countdownSync.ts's
 * `LEAD_MS_OPTIONS`) via the same one election, and that same duration is
 * re-applied as its own full countdown before each of the `maxPhotos`
 * shots, with a fixed `ROUND_PAUSE_MS` (2s) quiet gap after each shot
 * before the next countdown numeral appears — countdown -> shot -> pause ->
 * countdown -> shot -> pause -> ..., `maxPhotos` times. This is a
 * deliberate, real-photobooth-style rework of the previous "one countdown,
 * then instant local rapid-fire burst" model: there is no longer a "shots
 * 1-3 are just quick follow-ups" shortcut.
 *
 * Scheduling model — chained, epoch-anchored:
 *   - `targets[i] = firstTargetEpoch + i * (leadMs + pauseMs)` are
 *     precomputed for every round up front, all anchored to the ONE
 *     original epoch the countdown election produced (`firstTargetEpoch`,
 *     round 0's target). `pauseMs` is a quiet gap after each shot — before
 *     the next round's countdown numeral even appears — it is NOT part of
 *     the visible countdown itself.
 *   - Shot 0 is captured synchronously at call time — its target has
 *     already arrived by the time this function is invoked (unchanged
 *     behavior from the old shot-0 handling). There is no pause before shot
 *     0 — only between shots, once capture has actually begun.
 *   - Each subsequent round is only armed AFTER the previous round's
 *     capture + broadcast has fully settled (resolved or rejected) AND the
 *     `pauseMs` gap that follows it has elapsed — only then does
 *     `onRoundAdvance` tell the caller to re-point its countdown UI at the
 *     next round's target, which is followed by its own full `leadMs`
 *     countdown. Both that pause delay and the countdown delay after it are
 *     recomputed from their own absolute target epoch at the moment each
 *     timer is armed (`Math.max(0, target - now())`), never a fixed
 *     interval and never cumulative from call time.
 *   - Chaining (rather than pre-arming all rounds' timers up front, the way
 *     the old shots-1-3 burst did) guarantees a later round's capture timer
 *     can never fire before its own `onRoundAdvance` has told the UI to
 *     show that round's countdown — which pre-arming would risk if an
 *     earlier round's broadcast happened to be unusually slow.
 *   - Anchoring every round's delay (both the pause and the countdown that
 *     follows it) to the ORIGINAL absolute schedule (rather than a fixed
 *     interval measured from when each timer was armed) keeps every round
 *     self-correcting against that one shared epoch instead of compounding
 *     drift round over round; `Math.max(0, …)` clamps a pathologically slow
 *     prior round to firing immediately instead of scheduling a negative
 *     delay.
 */

export const MAX_PHOTOS = 4;

/**
 * Quiet gap (ms) after each shot before the next round's countdown numeral
 * appears (see the module doc comment above) — a deliberate pause, not part
 * of the countdown itself.
 */
export const ROUND_PAUSE_MS = 2000;

export interface CaptureSequenceDeps {
  /**
   * Captures one frame right now and returns its data URL, or `null` if a
   * frame genuinely can't be captured (e.g. the video element is gone,
   * component unmounted mid-sequence). Synchronous — Canvas 2D's
   * `toDataURL` has no async variant, so this stays true to how it's
   * actually called.
   */
  captureFrame: (shotIndex: number) => string | null;
  /** Relays one captured shot. shotIndex orders shots within this participant's own sequence. */
  broadcastShot: (shotIndex: number, dataUrl: string) => Promise<void>;
  /** Local bookkeeping hook (e.g. filling CaptureClient's shotsRef, updating UI state) — fired per shot, right after capture and before its broadcast is awaited. */
  onShotCaptured?: (shotIndex: number, dataUrl: string) => void;
  /** Injectable clock — tests only. Defaults to Date.now. */
  now?: () => number;
  /** Injectable timer — tests only. Defaults to the global setTimeout/clearTimeout. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface CaptureSequenceCallbacks {
  /**
   * Fires once shot `shotIndex`'s capture+broadcast has settled AND the
   * `pauseMs` quiet gap that follows it has elapsed (NOT immediately after
   * settling) — when there IS a next round (i.e. after shots 0, 1, 2 but
   * not after the final shot). `nextTargetEpoch = firstTargetEpoch +
   * (shotIndex + 1) * (leadMs + pauseMs)` — feed directly into
   * `<Countdown targetTimestamp={nextTargetEpoch}>` so the UI re-arms a
   * fresh full-duration countdown for the next round, right as that pause
   * ends.
   */
  onRoundAdvance: (nextShotIndex: number, nextTargetEpoch: number) => void;
  /**
   * Fires exactly once, after all `maxPhotos` shots have captured and their
   * broadcasts have settled (resolved or rejected — a single failed send
   * must never hang the whole sequence). Same trigger point as the old
   * burst's `onComplete` — the only point the caller should broadcast
   * `capture_ack` / mark presence `"captured"`.
   */
  onComplete: () => void;
  /**
   * Optional: `driftMs = now() - targets[shotIndex]` measured at the instant
   * that round's timer actually fired. Fires for shots 1..N-1 only — round
   * 0's own drift is reported by lib/countdownSync.ts itself, via its
   * `onCaptureTime` callback, since round 0's target/timer live there, not
   * in this module.
   */
  onRoundCaptureTime?: (shotIndex: number, driftMs: number) => void;
}

export interface CaptureSequenceOptions {
  /** countdownSync's `localTargetEpoch` for round 0 — already elapsed by call time. */
  firstTargetEpoch: number;
  /** The winning election's leadMs (lib/countdownSync.ts's `LEAD_MS_OPTIONS`) — the countdown duration reapplied every round. */
  leadMs: number;
  /** Quiet gap (ms) between a shot and the next round's countdown numeral appearing. Defaults to `ROUND_PAUSE_MS`; overridable for tests only. */
  pauseMs?: number;
  maxPhotos?: number;
}

export interface CaptureSequenceHandle {
  /** Cancels the single pending next-round timer, if any (shot 0 has already happened by the time this handle is returned). */
  stop: () => void;
}

export function runCaptureSequence(
  deps: CaptureSequenceDeps,
  callbacks: CaptureSequenceCallbacks,
  options: CaptureSequenceOptions
): CaptureSequenceHandle {
  const maxPhotos = options.maxPhotos ?? MAX_PHOTOS;
  const pauseMs = options.pauseMs ?? ROUND_PAUSE_MS;
  const now = deps.now ?? Date.now;
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;

  // Precomputed once, up front — every round's delay is recomputed against
  // these fixed absolute epochs, never against a fixed interval or a
  // moving "time since last round" baseline. Each round after the first
  // costs leadMs (its own countdown) + pauseMs (the quiet gap before that
  // countdown's numeral appears) — see afterShotSettled below.
  const targets = Array.from(
    { length: maxPhotos },
    (_, shotIndex) => options.firstTargetEpoch + shotIndex * (options.leadMs + pauseMs)
  );

  let stopped = false;
  // The single "next pending timer," reassigned each time a round is
  // chained — there is never more than one round's timer armed at once,
  // per the chained (not pre-armed-in-parallel) design.
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function captureAndBroadcast(shotIndex: number) {
    if (stopped) return;

    const dataUrl = deps.captureFrame(shotIndex);
    if (dataUrl === null) {
      // No frame available (e.g. unmounted mid-sequence) — still counts
      // toward completion/advancement so a missing frame can never hang
      // the sequence forever.
      afterShotSettled(shotIndex);
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
        afterShotSettled(shotIndex);
      });
  }

  function afterShotSettled(shotIndex: number) {
    if (stopped) return;

    const nextShotIndex = shotIndex + 1;
    if (nextShotIndex >= maxPhotos) {
      callbacks.onComplete();
      return;
    }

    const nextTargetEpoch = targets[nextShotIndex];
    // The quiet gap between this shot and the next round's countdown
    // numeral appearing — `nextTargetEpoch - leadMs` lands exactly
    // `pauseMs` after this round's own target, by construction of
    // `targets` above. Anchored to that absolute epoch (not a fixed
    // pauseMs timer armed from "now"), for the same self-correcting reason
    // every other delay in this module is epoch-anchored.
    const pauseEndEpoch = nextTargetEpoch - options.leadMs;
    const pauseDelayMs = Math.max(0, pauseEndEpoch - now());

    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null;
      if (stopped) return;

      // Reveals the next round's countdown numeral only once the pause has
      // actually elapsed — not immediately after this shot's capture — so
      // the UI shows a quiet pause between shots instead of restarting the
      // countdown the instant the previous one ends.
      callbacks.onRoundAdvance(nextShotIndex, nextTargetEpoch);

      const delayMs = Math.max(0, nextTargetEpoch - now());
      pendingTimer = setTimeoutFn(() => {
        pendingTimer = null;
        if (stopped) return;
        const driftMs = now() - nextTargetEpoch;
        callbacks.onRoundCaptureTime?.(nextShotIndex, driftMs);
        captureAndBroadcast(nextShotIndex);
      }, delayMs);
    }, pauseDelayMs);
  }

  // Shot 0 fires immediately/synchronously — this preserves the precise
  // server-anchored timing lib/countdownSync.ts already scheduled; nothing
  // in this module adds delay before it.
  captureAndBroadcast(0);

  return {
    stop() {
      stopped = true;
      if (pendingTimer) {
        clearTimeoutFn(pendingTimer);
        pendingTimer = null;
      }
    },
  };
}
