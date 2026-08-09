"use client";

/**
 * Client-side identity persistence across navigation within a session.
 *
 * WaitingClient's joined-participant identity (`participantId`,
 * `realtimeToken`, `displayName`) previously lived only in React state,
 * which is lost the moment the browser navigates from `/waiting` to
 * `/capture`. This module persists it to `sessionStorage`, keyed by session
 * id, so the invite-room path (WaitingClient saves after `/join`), the
 * direct-solo path (ModeSelectClient saves the host identity
 * `POST /api/sessions` already returned, before ever navigating to
 * `/capture` — see that file's doc comment), and CaptureClient's own
 * last-resort fallback `/join` call all converge on the same stored shape
 * before capture logic runs.
 *
 * `sessionStorage` (not `localStorage`) is deliberate: this identity is
 * scoped to one browser tab's session-in-progress, not something that
 * should survive across tabs or persist indefinitely once the tab closes.
 */

export interface StoredParticipant {
  participantId: string;
  realtimeToken: string;
  displayName: string;
}

function storageKey(sessionId: string): string {
  return `photobooth:${sessionId}:participant`;
}

/**
 * Persists the joined participant's identity for `sessionId`. Silently
 * no-ops outside the browser (SSR) or if `sessionStorage` throws (e.g.
 * private-browsing storage restrictions) — losing this persistence is
 * non-fatal, since the in-memory React state for the current page load is
 * still valid; only cross-navigation continuity is affected.
 */
export function saveStoredParticipant(
  sessionId: string,
  participant: StoredParticipant
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(sessionId),
      JSON.stringify(participant)
    );
  } catch (err) {
    console.warn(
      `[participantStorage] failed to persist participant for session ${sessionId}`,
      err
    );
  }
}

function isStoredParticipant(value: unknown): value is StoredParticipant {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.participantId === "string" &&
    typeof candidate.realtimeToken === "string" &&
    typeof candidate.displayName === "string"
  );
}

/**
 * Reads back the joined participant's identity for `sessionId`, or `null`
 * if nothing was ever stored, the stored value is malformed, or
 * `sessionStorage` is unavailable (SSR, private browsing). Callers (e.g.
 * CaptureClient) treat `null` as "not yet joined" and fall back to calling
 * `POST /api/sessions/:id/join` directly.
 */
export function loadStoredParticipant(
  sessionId: string
): StoredParticipant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredParticipant(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
