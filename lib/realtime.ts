"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

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

/** Returns (and lazily joins) the Realtime channel for a session. */
export function getSessionChannel(sessionId: string): RealtimeChannel {
  void sessionId;
  throw new Error("not implemented");
}

/** Sets the short-lived per-participant Realtime Authorization token minted by `POST /api/sessions/:id/join`. */
export function setRealtimeAuth(token: string): void {
  void token;
  throw new Error("not implemented");
}

/** Tracks this client's presence state on the session channel. */
export async function trackPresence(
  sessionId: string,
  state: PresenceState
): Promise<void> {
  void sessionId;
  void state;
  throw new Error("not implemented");
}

/** Subscribes to presence sync/join/leave events; returns an unsubscribe function. */
export function subscribeToPresence(
  sessionId: string,
  onSync: (states: PresenceState[]) => void
): () => void {
  void sessionId;
  void onSync;
  throw new Error("not implemented");
}

/** Broadcasts `countdown_start` with a server-fetched timestamp (TRD §3). */
export async function broadcastCountdownStart(
  sessionId: string,
  payload: CountdownStartPayload
): Promise<void> {
  void sessionId;
  void payload;
  throw new Error("not implemented");
}

/**
 * Subscribes to `countdown_start` broadcasts. Caller must locally schedule
 * capture at `payload.serverTimestamp`, not on receipt, to neutralize jitter.
 */
export function subscribeToCountdown(
  sessionId: string,
  onCountdownStart: (payload: CountdownStartPayload) => void
): () => void {
  void sessionId;
  void onCountdownStart;
  throw new Error("not implemented");
}

/** Broadcasts `capture_ack` once this client has captured its shot. */
export async function broadcastCaptureAck(
  sessionId: string,
  payload: CaptureAckPayload
): Promise<void> {
  void sessionId;
  void payload;
  throw new Error("not implemented");
}

/** Subscribes to `capture_ack` broadcasts; returns an unsubscribe function. */
export function subscribeToCaptureAck(
  sessionId: string,
  onCaptureAck: (payload: CaptureAckPayload) => void
): () => void {
  void sessionId;
  void onCaptureAck;
  throw new Error("not implemented");
}

/**
 * Relays a captured shot to other participants so the host can composite the
 * final strip. Transient broadcast only — must never be persisted.
 */
export async function broadcastShot(
  sessionId: string,
  payload: ShotRelayPayload
): Promise<void> {
  void sessionId;
  void payload;
  throw new Error("not implemented");
}

/** Subscribes to relayed shots from other participants; returns an unsubscribe function. */
export function subscribeToShots(
  sessionId: string,
  onShot: (payload: ShotRelayPayload) => void
): () => void {
  void sessionId;
  void onShot;
  throw new Error("not implemented");
}

/** Leaves the session channel and releases resources. */
export function leaveSessionChannel(sessionId: string): void {
  void sessionId;
  throw new Error("not implemented");
}
