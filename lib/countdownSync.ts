"use client";

import type { CountdownStartPayload } from "./realtime";

/**
 * Self-electing countdown trigger + server-timestamp-scheduled capture
 * (TRD §3 hard requirement / implementation-plan Phase 6).
 *
 * There is no designated "host" for triggering `countdown_start` — any
 * client observing "all ready" can trigger it, and in virtually all real
 * cases this collapses to effectively one broadcast:
 *
 *   1. Every client starts listening for `countdown_start` immediately.
 *   2. Every client also arms a small random jitter timer. If it fires
 *      before any `countdown_start` has been received, that client fetches
 *      the authoritative server clock (`GET /api/time`) and broadcasts
 *      `countdown_start` itself — then immediately schedules its own
 *      capture off the payload it just authored, since Supabase Realtime
 *      broadcasts do not echo back to the sender by default and this client
 *      can't wait for a self-echo that may never arrive.
 *   3. Whichever `countdown_start` is received *first* (whether authored by
 *      this client or another) wins: capture is scheduled off it, and this
 *      client's own pending jitter timer (if still pending) is cancelled.
 *   4. Any *later*-arriving `countdown_start` — e.g. a straggler broadcast
 *      from another client whose jitter fired a few milliseconds after the
 *      winner's — is ignored. This is the "first received wins" rule:
 *      capture is NEVER rescheduled off a later broadcast, even though a
 *      naive reading might assume the "real" host's message should win.
 *      There is no host, so there's nothing more authoritative to defer to.
 */

/**
 * Fixed lead time (ms) between broadcasting `countdown_start` and the
 * server-anchored instant it announces for capture.
 *
 * Picked from the middle of the product spec's suggested 3000-5000ms range:
 * comfortably exceeds realistic broadcast + `GET /api/time` round-trip
 * latency (typically well under a few hundred ms, even on a throttled or
 * asymmetric connection per TRD §8's LDR/network-jitter risk), leaving
 * every participant's client time to receive the broadcast and prepare
 * (TRD §3) — while still reading as a natural photobooth "3…2…1" countdown
 * rather than an anxious wait, per the design brief's "quiet, patient tone."
 */
export const FIXED_LEAD_MS = 4000;

/**
 * Upper bound (ms) of the randomized delay each client waits, after
 * observing "all ready," before volunteering to broadcast `countdown_start`
 * itself.
 *
 * Small relative to FIXED_LEAD_MS so even the worst case (this client is
 * the one that ends up volunteering) barely dents the lead-time budget.
 * Wide enough (0-400ms, uniformly distributed) that when N clients hit "all
 * ready" within the same tick, the chance of two picking the *same* delay
 * is negligible — in practice exactly one client's jitter fires first, and
 * every other client cancels its own pending trigger the moment that
 * broadcast is received (step 3 above).
 */
export const JITTER_MAX_MS = 400;

export interface CountdownSyncDeps {
  /** Resolves the authoritative server clock reading — GET /api/time. */
  fetchServerNow: () => Promise<number>;
  broadcastCountdownStart: (payload: CountdownStartPayload) => Promise<void>;
  subscribeToCountdown: (
    onCountdownStart: (payload: CountdownStartPayload) => void
  ) => () => void;
}

export interface CountdownSyncCallbacks {
  /**
   * Fires exactly once, as soon as this client has locked onto a
   * `countdown_start` (self-triggered or received) and converted it into a
   * local-clock target via this client's own clock-offset correction. Feed
   * `localTargetEpoch` into <Countdown /> so it renders a real countdown
   * against this client's own clock, not the raw server timestamp.
   */
  onScheduled: (localTargetEpoch: number, serverTimestamp: number) => void;
  /**
   * Fires exactly once, from the `setTimeout` armed at the computed local
   * target. This is the ONLY place capture should ever be triggered from —
   * never from a broadcast/receive handler (TRD §3).
   */
  onCaptureTime: () => void;
}

export interface CountdownSyncOptions {
  leadMs?: number;
  jitterMaxMs?: number;
  /** Injectable clock — defaults to Date.now/Math.random. Tests only. */
  now?: () => number;
  random?: () => number;
}

export interface CountdownSyncHandle {
  /** Unsubscribes from countdown_start and cancels any pending jitter/capture timers. */
  stop: () => void;
}

export function startCountdownSync(
  deps: CountdownSyncDeps,
  callbacks: CountdownSyncCallbacks,
  options: CountdownSyncOptions = {}
): CountdownSyncHandle {
  const leadMs = options.leadMs ?? FIXED_LEAD_MS;
  const jitterMaxMs = options.jitterMaxMs ?? JITTER_MAX_MS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  // "First received wins": once true, no later call to `schedule` can ever
  // take effect again — see the guard at the top of `schedule` below.
  let settled = false;
  let jitterTimer: ReturnType<typeof setTimeout> | null = null;
  let captureTimer: ReturnType<typeof setTimeout> | null = null;

  function schedule(serverTimestamp: number, offsetMs: number) {
    // This check-and-set is synchronous (no `await` between them), so it's
    // atomic against the async races between handleReceived and volunteer
    // below — whichever call reaches this line first wins; a second call
    // arriving later (from either path) becomes a no-op here. This is the
    // literal enforcement of "first received wins" / "never reschedule off
    // a later-arriving broadcast."
    if (settled) return;
    settled = true;

    if (jitterTimer) {
      clearTimeout(jitterTimer);
      jitterTimer = null;
    }

    const localTargetEpoch = serverTimestamp + offsetMs;
    callbacks.onScheduled(localTargetEpoch, serverTimestamp);

    const delayMs = Math.max(0, localTargetEpoch - now());
    // TRD §3 hard requirement: capture is scheduled off this computed,
    // clock-offset-corrected LOCAL timeout — fired only when this
    // setTimeout elapses, never synchronously here on broadcast receipt.
    // Do not "simplify" this back to calling onCaptureTime() directly from
    // handleReceived/volunteer — that would reintroduce exactly the
    // network-jitter-sensitive receipt-triggering TRD §3 forbids.
    captureTimer = setTimeout(() => {
      captureTimer = null;
      callbacks.onCaptureTime();
    }, delayMs);
  }

  async function handleReceived(payload: CountdownStartPayload) {
    if (settled) return; // second-or-later broadcast — ignored outright, no need to even re-fetch server time.

    let offsetMs = 0;
    try {
      const serverNow = await deps.fetchServerNow();
      offsetMs = serverNow - now();
    } catch (err) {
      // Degraded but non-blocking: assume zero clock offset (treat the
      // received serverTimestamp as already on this client's local clock)
      // rather than never scheduling capture at all because of one failed
      // GET /api/time call.
      console.error(
        "[countdownSync] GET /api/time failed on countdown_start receipt; assuming zero clock offset",
        err
      );
    }
    schedule(payload.serverTimestamp, offsetMs);
  }

  async function volunteer() {
    jitterTimer = null;
    if (settled) return; // a broadcast already arrived before our jitter fired.

    let serverNow: number;
    try {
      serverNow = await deps.fetchServerNow();
    } catch (err) {
      console.error(
        "[countdownSync] GET /api/time failed while volunteering to trigger countdown_start; leaving it to another client's jitter",
        err
      );
      return;
    }
    if (settled) return; // a broadcast arrived while this fetch was in flight — defer to it instead.

    const localNowAtReading = now();
    const serverTimestamp = serverNow + leadMs;

    try {
      await deps.broadcastCountdownStart({ serverTimestamp });
    } catch (err) {
      console.error(
        "[countdownSync] failed to broadcast countdown_start; scheduling this client's own capture anyway",
        err
      );
      // Fall through — other clients may not have gotten it (their own
      // jitter will likely fire and pick up the slack), but this client
      // still needs to capture at *some* point rather than hang.
    }

    schedule(serverTimestamp, serverNow - localNowAtReading);
  }

  const unsubscribe = deps.subscribeToCountdown((payload) => {
    void handleReceived(payload);
  });

  jitterTimer = setTimeout(() => {
    void volunteer();
  }, Math.floor(random() * jitterMaxMs));

  return {
    stop() {
      unsubscribe();
      if (jitterTimer) {
        clearTimeout(jitterTimer);
        jitterTimer = null;
      }
      if (captureTimer) {
        clearTimeout(captureTimer);
        captureTimer = null;
      }
    },
  };
}

/** GET /api/time → the authoritative server clock reading. */
export async function fetchServerNow(): Promise<number> {
  const response = await fetch("/api/time", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GET /api/time failed with status ${response.status}`);
  }
  const body = (await response.json()) as { now: number };
  return body.now;
}
