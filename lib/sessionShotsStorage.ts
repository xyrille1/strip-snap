"use client";

/**
 * Client-side persistence for the SESSION-WIDE shot map — i.e. every
 * participant's `MAX_PHOTOS` shots, not just the current tab's own shots.
 *
 * Phase 7's `lib/shotStorage.ts` deliberately persists only "this
 * participant's own shots" (see that module's doc comment) because the
 * preview/retake screen only ever needs its own participant's view. Phase 8's
 * compositor needs the opposite: every participant's shots, so each slot on
 * the finished strip can show the *group* together (a small collage per
 * slot), not just the viewing participant's own photo.
 *
 * This is a deliberate SIBLING store, not an extension of
 * `lib/shotStorage.ts` — `StoredShots`'s shape (`{ participantId, shots }`)
 * is already covered by that module's own tests and consumed as-is by
 * PreviewClient's existing own-shots UI; changing its shape would be a
 * breaking change to an already-tested contract for no benefit, since the
 * two stores serve different readers (PreviewClient's own-shots panel vs.
 * StyleClient's group compositor preview) and naturally have different
 * lifecycles (this store gets a new entry per participant as their shots
 * arrive/are retaken, not just one participant's array).
 *
 * Same `sessionStorage` + `photobooth:${sessionId}:...` keying convention as
 * `lib/participantStorage.ts` / `lib/shotStorage.ts` for consistency, and for
 * the same sizing rationale (`lib/captureResolution.ts` caps every frame, so
 * even a friend-group session's worth of shots stays well within
 * sessionStorage's per-origin quota).
 */

/** participantId -> shots, index-aligned with shot index (0..MAX_PHOTOS-1). `null` = not captured (dropped participant, per the resolved dropped-participant assumption). */
export type SessionShotsMap = Record<string, (string | null)[]>;

function storageKey(sessionId: string): string {
  return `photobooth:${sessionId}:allShots`;
}

/**
 * Persists the full session-wide shot map for `sessionId`. Silently no-ops
 * outside the browser (SSR) or if `sessionStorage` throws (e.g.
 * private-browsing storage restrictions, quota exceeded) — matches
 * `lib/shotStorage.ts#saveStoredShots`'s non-fatal-failure posture.
 */
export function saveSessionShots(sessionId: string, shots: SessionShotsMap): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), JSON.stringify(shots));
  } catch (err) {
    console.warn(
      `[sessionShotsStorage] failed to persist session-wide shots for session ${sessionId}`,
      err
    );
  }
}

function isSessionShotsMap(value: unknown): value is SessionShotsMap {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(
    (shots) =>
      Array.isArray(shots) &&
      shots.every((shot) => typeof shot === "string" || shot === null)
  );
}

/**
 * Reads back the session-wide shot map for `sessionId`, or `null` if nothing
 * was ever stored, the stored value is malformed, or `sessionStorage` is
 * unavailable. Callers (StyleClient) treat `null` as "no hand-off found yet"
 * and fall back to an empty map.
 */
export function loadSessionShots(sessionId: string): SessionShotsMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSessionShotsMap(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reads the current session-wide map (or starts from `{}` if none stored
 * yet), sets `participantId`'s entry to `shots`, persists the result, and
 * returns the updated map — the read-modify-write PreviewClient's retake
 * flow needs to keep this participant's entry current without disturbing any
 * other participant's entry (mirrors `replaceShotAt`'s "only touch what
 * you're told to" guarantee, one level up at the per-participant map level).
 */
export function updateParticipantShots(
  sessionId: string,
  participantId: string,
  shots: (string | null)[]
): SessionShotsMap {
  const current = loadSessionShots(sessionId) ?? {};
  const next: SessionShotsMap = { ...current, [participantId]: shots };
  saveSessionShots(sessionId, next);
  return next;
}
