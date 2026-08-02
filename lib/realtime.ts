"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createRealtimeClient } from "@/lib/supabase/client";

/**
 * Supabase Realtime channel helpers for the `session:{id}` channel (TRD §5).
 * Real implementation lands in Step 4 Item 4 (presence/join) and Item 5
 * (countdown scheduling + shot relay). Stub signatures only.
 */

export type ParticipantStatus = "connected" | "ready" | "captured" | "dropped";

export interface PresenceState {
  participantId: string;
  displayName: string;
  status: ParticipantStatus;
}

export interface CountdownStartPayload {
  /** Epoch ms the capture should fire at — never trigger on broadcast receipt (TRD §3). */
  serverTimestamp: number;
}

export interface CaptureAckPayload {
  participantId: string;
}

/**
 * Transient shot-relay payload. Per the resolved multi-device compositing
 * approach, each participant's client broadcasts its captured shot to others
 * over this channel so the host can composite; shots are never written to a
 * table or Storage bucket (backend-schema §5 — "no raw photo reaches the
 * server[-side database/storage]").
 */
export interface ShotRelayPayload {
  participantId: string;
  shotIndex: number;
  dataUrl: string;
}

/** Broadcast event names used on the `session:{id}` channel (TRD §5). */
const BROADCAST_EVENTS = {
  countdownStart: "countdown_start",
  captureAck: "capture_ack",
  shot: "shot",
} as const;

/** Per-session channel cache — `getSessionChannel` is a lazy singleton per sessionId. */
const channels = new Map<string, RealtimeChannel>();

/**
 * Per-session set of application-level presence listeners. Populated by
 * `subscribeToPresence` calls; notified by the single raw SDK `.on("presence",
 * ...)` binding registered once, in `getSessionChannel`, at channel-creation
 * time (see that function's doc comment for why this indirection exists).
 */
const presenceListeners = new Map<string, Set<(states: PresenceState[]) => void>>();

function flattenPresenceState(channel: RealtimeChannel): PresenceState[] {
  const raw = channel.presenceState<PresenceState>();
  return Object.values(raw)
    .flat()
    .map(({ participantId, displayName, status }) => ({
      participantId,
      displayName,
      status,
    }));
}

/**
 * Per-session "is this channel actually joined yet" cache. Populated the first
 * time anything needs to send/receive on the channel; resolves once the
 * server acks `SUBSCRIBED`, rejects (and clears itself so a retry is
 * possible) on `CHANNEL_ERROR`/`TIMED_OUT`.
 */
const subscriptions = new Map<string, Promise<void>>();

function channelTopic(sessionId: string): string {
  return `session:${sessionId}`;
}

/** Returns (and lazily joins) the Realtime channel for a session. */
export function getSessionChannel(sessionId: string): RealtimeChannel {
  const existing = channels.get(sessionId);
  if (existing) return existing;

  const supabase = createRealtimeClient();
  const channel = supabase.channel(channelTopic(sessionId), {
    config: {
      // Required so the Realtime Authorization RLS policies on
      // realtime.messages (supabase/migrations/..._realtime_authorization.sql,
      // backend-schema §4's "one exception worth naming") actually apply to
      // this channel. A non-private channel bypasses that RLS check
      // entirely, which would defeat the whole point of the per-participant
      // token minted by POST /api/sessions/:id/join — this must stay `true`.
      private: true,
      // Explicit (rather than relying on the "auto-enable via .on('presence',
      // ...) listener" fallback) so presence is enabled regardless of call
      // order between getSessionChannel/subscribeToPresence/trackPresence.
      presence: { enabled: true },
    },
  });

  channels.set(sessionId, channel);

  // Registered exactly once, here, at channel-creation time — necessarily
  // before ANY caller (trackPresence, subscribeToPresence, broadcast*) could
  // have called channel.subscribe() yet, since creating the channel is
  // always the first thing that happens for a given sessionId (every
  // exported function in this module calls getSessionChannel first).
  //
  // This sidesteps a real supabase-realtime-js constraint discovered while
  // live-testing Phase 6's capture flow: `channel.on("presence", ...)`
  // throws ("cannot add `presence` callbacks for <topic> after
  // `subscribe()`") once the channel is joined or joining — unlike
  // `channel.on("broadcast", ...)`, which has no such restriction. Since
  // `trackPresence` and `subscribeToPresence` can legitimately be called in
  // either order by different components/effects, registering the raw
  // presence binding lazily inside `subscribeToPresence` (the original
  // approach) was a latent bug: whichever call happened to run after the
  // channel had already subscribed would throw. `subscribeToPresence` below
  // no longer calls `channel.on()` itself at all — it only adds/removes
  // from `presenceListeners`, which this one binding fans out to.
  const notifyPresenceListeners = () => {
    const listeners = presenceListeners.get(sessionId);
    if (!listeners || listeners.size === 0) return;
    const states = flattenPresenceState(channel);
    listeners.forEach((listener) => listener(states));
  };
  channel.on("presence", { event: "sync" }, notifyPresenceListeners);
  channel.on("presence", { event: "join" }, () => notifyPresenceListeners());
  channel.on("presence", { event: "leave" }, () => notifyPresenceListeners());

  return channel;
}

/**
 * Sets the short-lived per-participant Realtime Authorization token minted by
 * `POST /api/sessions/:id/join`.
 *
 * NOTE: widened from the original `void`-returning stub signature to
 * `Promise<void>` — this is a genuine bug fix, not a style choice. The
 * underlying `supabase.realtime.setAuth()` call is asynchronous, and per
 * Supabase's Realtime Authorization flow this must be *awaited* before
 * `channel.subscribe()` runs (a private channel's join push needs the auth
 * token already set, or the server-side RLS check on `realtime.messages`
 * has nothing to authorize against). A `void`-returning function gives
 * callers nothing to await, silently reintroducing the race it's supposed to
 * prevent.
 */
export async function setRealtimeAuth(token: string): Promise<void> {
  const supabase = createRealtimeClient();
  await supabase.realtime.setAuth(token);
}

/**
 * Ensures the session's channel has been asked to subscribe, and resolves
 * once the server confirms `SUBSCRIBED`. Idempotent per sessionId — safe to
 * call from multiple exported functions without double-subscribing.
 *
 * Every send-side action (`trackPresence`, `broadcastCountdownStart`,
 * `broadcastCaptureAck`, `broadcastShot`) awaits this first, since Realtime
 * silently drops sends on a channel that hasn't finished joining yet.
 * Listen-side functions (`subscribeTo*`) kick this off too (fire-and-forget,
 * since their own signatures are synchronous) so that simply subscribing is
 * enough to bring the channel up — callers aren't required to separately
 * "connect" the channel.
 */
function ensureSubscribed(sessionId: string): Promise<void> {
  const cached = subscriptions.get(sessionId);
  if (cached) return cached;

  const channel = getSessionChannel(sessionId);

  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        resolve();
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        subscriptions.delete(sessionId);
        reject(
          err ??
            new Error(
              `Realtime channel subscription failed for ${channelTopic(sessionId)} (${status})`
            )
        );
      }
      // "CLOSED" fires after leaveSessionChannel()'s unsubscribe/removeChannel
      // call — no action needed, that path already clears both caches.
    });
  });

  subscriptions.set(sessionId, ready);
  return ready;
}

/** Tracks this client's presence state on the session channel. */
export async function trackPresence(
  sessionId: string,
  state: PresenceState
): Promise<void> {
  await ensureSubscribed(sessionId);
  const channel = getSessionChannel(sessionId);
  const result = await channel.track({ ...state });
  if (result !== "ok") {
    console.warn(
      `[realtime] trackPresence on ${channelTopic(sessionId)} returned "${result}"`
    );
  }
}

/**
 * Subscribes to presence sync/join/leave events; returns an unsubscribe
 * function. Safe to call in any order relative to `trackPresence` or other
 * `subscribeTo*`/`broadcast*` calls for the same session — see
 * `getSessionChannel`'s doc comment for why this only ever touches the
 * `presenceListeners` registry, never `channel.on()` directly.
 */
export function subscribeToPresence(
  sessionId: string,
  onSync: (states: PresenceState[]) => void
): () => void {
  // Ensures the channel — and its one-time raw presence bindings — exists
  // before this listener is registered.
  const channel = getSessionChannel(sessionId);

  let listeners = presenceListeners.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    presenceListeners.set(sessionId, listeners);
  }
  listeners.add(onSync);

  // Seed the new listener with whatever presence state is already known
  // *right now*, not just future changes. Without this, a listener that
  // subscribes after the channel's presence has already stabilized (e.g. a
  // late-mounting effect, or another participant joining/becoming ready
  // between two rapid re-renders) would never receive a raw "sync"/"join"/
  // "leave" event again and would wait forever for a state that already
  // exists — exactly the kind of hang `computeAllReady`'s callers
  // (WaitingClient, CaptureClient's countdown election) can't afford.
  // Harmless when nothing is known yet: `flattenPresenceState` returns `[]`
  // before the channel has synced, and `computeAllReady([])` is `false`.
  //
  // Deferred to a microtask rather than called synchronously here: a caller
  // who assigns this function's return value to `unsubscribe` and then
  // calls `unsubscribe()` from *within* `onSync` itself (a common
  // "subscribe, wait for a condition, then unsubscribe" one-shot pattern)
  // would otherwise reference `unsubscribe` before its `const` assignment
  // has completed. Deferring avoids that footgun for every caller, at the
  // cost of a sub-millisecond delay before the first callback fires.
  const listenersForSeed = listeners;
  queueMicrotask(() => {
    if (!listenersForSeed.has(onSync)) return; // already unsubscribed before the microtask ran
    onSync(flattenPresenceState(channel));
  });

  void ensureSubscribed(sessionId).catch((err) => {
    console.error(`[realtime] failed to subscribe to ${channelTopic(sessionId)}`, err);
  });

  return () => {
    presenceListeners.get(sessionId)?.delete(onSync);
  };
}

/** Broadcasts `countdown_start` with a server-fetched timestamp (TRD §3). */
export async function broadcastCountdownStart(
  sessionId: string,
  payload: CountdownStartPayload
): Promise<void> {
  await ensureSubscribed(sessionId);
  const channel = getSessionChannel(sessionId);
  const result = await channel.send({
    type: "broadcast",
    event: BROADCAST_EVENTS.countdownStart,
    payload,
  });
  if (result !== "ok") {
    console.warn(
      `[realtime] broadcastCountdownStart on ${channelTopic(sessionId)} returned "${result}"`
    );
  }
}

/**
 * Subscribes to `countdown_start` broadcasts. Caller must locally schedule
 * capture at `payload.serverTimestamp`, not on receipt, to neutralize jitter.
 */
export function subscribeToCountdown(
  sessionId: string,
  onCountdownStart: (payload: CountdownStartPayload) => void
): () => void {
  const channel = getSessionChannel(sessionId);
  let stopped = false;

  channel.on<CountdownStartPayload>(
    "broadcast",
    { event: BROADCAST_EVENTS.countdownStart },
    ({ payload }) => {
      if (stopped) return;
      onCountdownStart(payload);
    }
  );

  void ensureSubscribed(sessionId).catch((err) => {
    console.error(`[realtime] failed to subscribe to ${channelTopic(sessionId)}`, err);
  });

  return () => {
    stopped = true;
  };
}

/** Broadcasts `capture_ack` once this client has captured its shot. */
export async function broadcastCaptureAck(
  sessionId: string,
  payload: CaptureAckPayload
): Promise<void> {
  await ensureSubscribed(sessionId);
  const channel = getSessionChannel(sessionId);
  const result = await channel.send({
    type: "broadcast",
    event: BROADCAST_EVENTS.captureAck,
    payload,
  });
  if (result !== "ok") {
    console.warn(
      `[realtime] broadcastCaptureAck on ${channelTopic(sessionId)} returned "${result}"`
    );
  }
}

/** Subscribes to `capture_ack` broadcasts; returns an unsubscribe function. */
export function subscribeToCaptureAck(
  sessionId: string,
  onCaptureAck: (payload: CaptureAckPayload) => void
): () => void {
  const channel = getSessionChannel(sessionId);
  let stopped = false;

  channel.on<CaptureAckPayload>(
    "broadcast",
    { event: BROADCAST_EVENTS.captureAck },
    ({ payload }) => {
      if (stopped) return;
      onCaptureAck(payload);
    }
  );

  void ensureSubscribed(sessionId).catch((err) => {
    console.error(`[realtime] failed to subscribe to ${channelTopic(sessionId)}`, err);
  });

  return () => {
    stopped = true;
  };
}

/**
 * Relays a captured shot to other participants so the host can composite the
 * final strip. Transient broadcast only — must never be persisted.
 */
export async function broadcastShot(
  sessionId: string,
  payload: ShotRelayPayload
): Promise<void> {
  await ensureSubscribed(sessionId);
  const channel = getSessionChannel(sessionId);
  const result = await channel.send({
    type: "broadcast",
    event: BROADCAST_EVENTS.shot,
    payload,
  });
  if (result !== "ok") {
    console.warn(
      `[realtime] broadcastShot on ${channelTopic(sessionId)} returned "${result}"`
    );
  }
}

/** Subscribes to relayed shots from other participants; returns an unsubscribe function. */
export function subscribeToShots(
  sessionId: string,
  onShot: (payload: ShotRelayPayload) => void
): () => void {
  const channel = getSessionChannel(sessionId);
  let stopped = false;

  channel.on<ShotRelayPayload>(
    "broadcast",
    { event: BROADCAST_EVENTS.shot },
    ({ payload }) => {
      if (stopped) return;
      onShot(payload);
    }
  );

  void ensureSubscribed(sessionId).catch((err) => {
    console.error(`[realtime] failed to subscribe to ${channelTopic(sessionId)}`, err);
  });

  return () => {
    stopped = true;
  };
}

/** Leaves the session channel and releases resources. */
export function leaveSessionChannel(sessionId: string): void {
  const channel = channels.get(sessionId);
  channels.delete(sessionId);
  subscriptions.delete(sessionId);
  presenceListeners.delete(sessionId);

  if (!channel) return;

  const supabase = createRealtimeClient();
  void supabase.removeChannel(channel);
}
