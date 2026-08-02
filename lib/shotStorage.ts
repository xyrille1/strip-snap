"use client";

/**
 * Client-side persistence for one participant's own captured shots, across
 * the /capture -> /preview navigation.
 *
 * CaptureClient.tsx accumulates captured frames in an in-memory `shotsRef`
 * (a plain `useRef` Map) that is lost the instant React unmounts
 * CaptureClient on navigation to /preview — the same hand-off problem
 * lib/participantStorage.ts already solved for participant identity across
 * /waiting -> /capture. This module mirrors that module's pattern and
 * storage-key convention (`photobooth:${sessionId}:...`) for the shots
 * themselves: CaptureClient calls `saveStoredShots` right before it
 * navigates to /preview; PreviewClient calls `loadStoredShots` on mount.
 *
 * `sessionStorage` (not IndexedDB) is deliberate: every captured frame is
 * already capped by lib/captureResolution.ts to comfortably fit within a
 * small fraction of sessionStorage's ~5-10MB per-origin quota (see that
 * module's doc comment for the full sizing rationale), and only this
 * participant's OWN `MAX_PHOTOS` (4) shots are persisted here — not every
 * participant's relayed shots (see PreviewClient.tsx's doc comment for why
 * the preview screen only ever displays this participant's own shots). That
 * keeps total storage well under 1MB in the typical case, so reusing
 * `sessionStorage` — the same synchronous, already-proven mechanism
 * participantStorage.ts uses — avoids the added complexity of an async
 * IndexedDB API for what's fundamentally the same "small blob keyed by
 * session, scoped to one tab" problem.
 */

export interface StoredShots {
  participantId: string;
  /**
   * Index-aligned with shot index (0..MAX_PHOTOS-1). `null` means "not yet
   * captured" — e.g. this participant's burst was cut short because they
   * dropped mid-capture (Phase 6's resolved dropped-participant handling).
   * PreviewClient renders a `null` slot as an empty placeholder that retake
   * can fill in like any other shot.
   */
  shots: (string | null)[];
}

function storageKey(sessionId: string): string {
  return `photobooth:${sessionId}:shots`;
}

/**
 * Persists this participant's own captured shots for `sessionId`. Silently
 * no-ops outside the browser (SSR) or if `sessionStorage` throws (e.g.
 * private-browsing storage restrictions, or quota exceeded) — losing this
 * persistence is non-fatal for the current page load's in-memory state, only
 * cross-navigation continuity is affected.
 */
export function saveStoredShots(sessionId: string, data: StoredShots): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), JSON.stringify(data));
  } catch (err) {
    console.warn(
      `[shotStorage] failed to persist shots for session ${sessionId}`,
      err
    );
  }
}

function isStoredShots(value: unknown): value is StoredShots {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.participantId === "string" &&
    Array.isArray(candidate.shots) &&
    candidate.shots.every((shot) => typeof shot === "string" || shot === null)
  );
}

/**
 * Reads back this participant's own captured shots for `sessionId`, or
 * `null` if nothing was ever stored, the stored value is malformed, or
 * `sessionStorage` is unavailable (SSR, private browsing). Callers (e.g.
 * PreviewClient) treat `null` as "no hand-off found" and fall back to an
 * empty shot set.
 */
export function loadStoredShots(sessionId: string): StoredShots | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredShots(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Pure, immutable "replace one shot" update — returns a new array where only
 * `index` differs from `shots`; every other index carries over unchanged.
 *
 * This is the core of the retake guarantee test-plan F-16/F-17 exercise:
 * retaking shot N must never disturb any other shot (F-16), and repeated
 * retakes — e.g. shot 2, then shot 0, then shot 2 again — must never
 * duplicate or lose a shot (F-17), since every call starts fresh from
 * whatever array it's given and only ever touches the one index it's told
 * to. Callers (PreviewClient) always pass the *latest* shots array (from
 * React state) into each retake, so there's no stale-closure risk of an
 * update silently reverting a previous retake.
 */
export function replaceShotAt(
  shots: readonly (string | null)[],
  index: number,
  dataUrl: string
): (string | null)[] {
  return shots.map((shot, i) => (i === index ? dataUrl : shot));
}
