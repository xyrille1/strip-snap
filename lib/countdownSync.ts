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
 * User-selectable lead time (ms) between broadcasting `countdown_start` and
 * the server-anchored instant it announces for capture. Per-shot: this same
 * duration is re-applied before EACH of the `MAX_PHOTOS` shots (see
 * lib/captureBurst.ts's `runCaptureSequence`), not just once.
 *
 * There is no "host" — every participant picks their own value locally, but
 * only the winning client's own currently-selected value (closed over in
 * `volunteer()` below) is actually broadcast and adopted by the whole group,
 * via the `leadMs` field now carried on `CountdownStartPayload`.
 */
export const LEAD_MS_OPTIONS = [5000, 10000] as const;
export type LeadDurationMs = (typeof LEAD_MS_OPTIONS)[number];
export const DEFAULT_LEAD_MS: LeadDurationMs = 5000;

/**
 * Upper bound (ms) of the randomized delay each client waits, after
 * observing "all ready," before volunteering to broadcast `countdown_start`
 * itself.
 *
 * Small relative to the selected leadMs (LEAD_MS_OPTIONS) so even the worst case (this client is
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
   *
   * `leadMs` is the WINNING client's per-shot duration — this client's own
   * `options.leadMs` selection if this client won the election (volunteered),
   * or the broadcaster's value if this client instead received the winning
   * broadcast. The caller should stash both `localTargetEpoch` and `leadMs`
   * (e.g. in a ref) to compute later rounds' targets itself — see
   * lib/captureBurst.ts's `runCaptureSequence`.
   */
  onScheduled: (localTargetEpoch: number, serverTimestamp: number, leadMs: number) => void;
  /**
   * Fires exactly once, from the `setTimeout` armed at the computed local
   * target. This is the ONLY place capture should ever be triggered from —
   * never from a broadcast/receive handler (TRD §3).
   *
   * `driftMs` is `now() - localTargetEpoch` measured at the instant this
   * setTimeout actually fired — i.e. how much later than its scheduled
   * target the real local capture trigger landed (never negative in
   * practice, since a JS timer can fire late but not early). This module is
   * the only place with visibility into both the scheduled target and the
   * actual fire time, so it computes the measurement; the caller (which
   * knows the session id) decides whether/how to report it — see
   * CaptureClient.tsx's `onCaptureTime` handler for the Sentry capture on
   * outlier drift (ops-runbook.md §7).
   */
  onCaptureTime: (driftMs: number) => void;
}

export interface CountdownSyncOptions {
  leadMs?: LeadDurationMs;
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
  const leadMs = options.leadMs ?? DEFAULT_LEAD_MS;
  const jitterMaxMs = options.jitterMaxMs ?? JITTER_MAX_MS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  // "First received wins": once true, no later call to `schedule` can ever
  // take effect again — see the guard at the top of `schedule` below.
  let settled = false;
  let jitterTimer: ReturnType<typeof setTimeout> | null = null;
  let captureTimer: ReturnType<typeof setTimeout> | null = null;

  function schedule(serverTimestamp: number, offsetMs: number, roundLeadMs: number) {
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
    callbacks.onScheduled(localTargetEpoch, serverTimestamp, roundLeadMs);

    const delayMs = Math.max(0, localTargetEpoch - now());
    // TRD §3 hard requirement: capture is scheduled off this computed,
    // clock-offset-corrected LOCAL timeout — fired only when this
    // setTimeout elapses, never synchronously here on broadcast receipt.
    // Do not "simplify" this back to calling onCaptureTime() directly from
    // handleReceived/volunteer — that would reintroduce exactly the
    // network-jitter-sensitive receipt-triggering TRD §3 forbids.
    captureTimer = setTimeout(() => {
      captureTimer = null;
      const driftMs = now() - localTargetEpoch;
      callbacks.onCaptureTime(driftMs);
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
    // Critical to the "no host, winner decides for the group" mechanic: a
    // client that loses the election adopts the BROADCASTER's leadMs here
    // (payload.leadMs), discarding its own local `options.leadMs` selection
    // entirely. `payload` crossed the wire from another client's browser, so
    // the TS type is not a runtime guarantee — a stale client from a
    // mid-session deploy could broadcast a payload from before `leadMs`
    // existed. Falling back to DEFAULT_LEAD_MS keeps a bad/missing value
    // from propagating into captureBurst.ts's `targets` array as NaN
    // (which would make every round after the first fire immediately).
    const roundLeadMs = Number.isFinite(payload.leadMs) ? payload.leadMs : DEFAULT_LEAD_MS;
    schedule(payload.serverTimestamp, offsetMs, roundLeadMs);
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
      // This client's own currently-selected duration (closed over from
      // `options.leadMs` at the top of this function) is what gets
      // broadcast — every other client adopts it via handleReceived above,
      // discarding their own pick if it differed. No host, no DB storage.
      await deps.broadcastCountdownStart({ serverTimestamp, leadMs });
    } catch (err) {
      console.error(
        "[countdownSync] failed to broadcast countdown_start; scheduling this client's own capture anyway",
        err
      );
      // Fall through — other clients may not have gotten it (their own
      // jitter will likely fire and pick up the slack), but this client
      // still needs to capture at *some* point rather than hang.
    }

    schedule(serverTimestamp, serverNow - localNowAtReading, leadMs);
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
