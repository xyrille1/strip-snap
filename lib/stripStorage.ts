"use client";

/**
 * Client-side hand-off for the generated strip's id, across the
 * /generate -> /output navigation. Same `sessionStorage` +
 * `photobooth:${sessionId}:...` keying convention as
 * `lib/participantStorage.ts` / `lib/styleStorage.ts` /
 * `lib/sessionShotsStorage.ts`.
 *
 * GenerateClient calls `saveGeneratedStripId` right after `POST /api/strips`
 * succeeds, immediately before navigating to `/session/:id/output`.
 * OutputClient calls `loadGeneratedStripId` on mount to know which strip to
 * fetch via `GET /api/strips/:id`.
 */

function storageKey(sessionId: string): string {
  return `photobooth:${sessionId}:stripId`;
}

export function saveGeneratedStripId(sessionId: string, stripId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), stripId);
  } catch (err) {
    console.warn(
      `[stripStorage] failed to persist strip id for session ${sessionId}`,
      err
    );
  }
}

/**
 * Reads back the generated strip id for `sessionId`, or `null` if nothing
 * was stored or `sessionStorage` is unavailable. Callers (OutputClient)
 * treat `null` as "no hand-off found" and show a fallback pointing the user
 * back to `/generate`.
 */
export function loadGeneratedStripId(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(storageKey(sessionId));
  } catch {
    return null;
  }
}
