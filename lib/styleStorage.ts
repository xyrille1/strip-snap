"use client";

/**
 * Client-side persistence for the chosen style preset across the
 * /style -> /generate navigation. Same `sessionStorage` +
 * `photobooth:${sessionId}:...` keying convention as
 * `lib/participantStorage.ts` / `lib/shotStorage.ts` /
 * `lib/sessionShotsStorage.ts`.
 *
 * Scoped narrowly to just the hand-off value StyleClient produces
 * (`StylePreset`) — Phase 9/10 (`POST /api/strips`, GenerateClient) is what
 * actually reads this to build `createStripSchema`'s `stylePreset` field;
 * this module only exists so that value survives the navigation, not to
 * pre-empt any Phase 9/10 UI/API work.
 */

import type { StylePreset } from "@/lib/compositor";
import { STYLE_PRESETS } from "@/lib/validation/strip";

function storageKey(sessionId: string): string {
  return `photobooth:${sessionId}:style`;
}

export function saveSelectedStyle(sessionId: string, stylePreset: StylePreset): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), stylePreset);
  } catch (err) {
    console.warn(
      `[styleStorage] failed to persist style preset for session ${sessionId}`,
      err
    );
  }
}

/**
 * Reads back the previously selected style preset for `sessionId`, or `null`
 * if nothing was stored, the stored value isn't a recognized preset, or
 * `sessionStorage` is unavailable.
 */
export function loadSelectedStyle(sessionId: string): StylePreset | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (raw && (STYLE_PRESETS as readonly string[]).includes(raw)) {
      return raw as StylePreset;
    }
    return null;
  } catch {
    return null;
  }
}
