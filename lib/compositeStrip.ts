"use client";

/**
 * Shared image-loading + final-flatten helpers built on top of
 * `lib/compositor.ts`'s pure `computeStripLayout`/`drawStrip` pair.
 *
 * `components/booth/StripPreview.tsx` (Phase 8) already had its own inline
 * "load every participant's data-URL shots into `Image` elements, then
 * `drawStrip`" logic for the LIVE preview canvas. Phase 10 needs the exact
 * same image-loading step to produce the FINAL flattened strip image (the
 * `imageDataUrl` POST /api/strips expects) — rather than re-implementing
 * that loop a second time in GenerateClient, this module extracts it once
 * and both StripPreview and GenerateClient call it. `drawStrip` itself is
 * NOT wrapped/duplicated here — callers still call it directly from
 * `lib/compositor.ts`, so there is exactly one place the actual Canvas
 * drawing happens.
 */

import {
  computeStripLayout,
  drawStrip,
  type StripFormat,
  type StripImages,
  type StylePreset,
} from "@/lib/compositor";
import type { SessionShotsMap } from "@/lib/sessionShotsStorage";

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Resolves the sorted participant id list + effective participant count for
 * a session-wide shot map, given an optional authoritative override (e.g.
 * from `GET /api/sessions/:id`). Mirrors the count logic StripPreview
 * previously inlined — shared here so GenerateClient's final composite uses
 * the exact same "how many collage slots" decision as the live preview did.
 */
export function resolveParticipants(
  shotsByParticipant: SessionShotsMap,
  participantCountOverride?: number
): { participantIds: string[]; participantCount: number } {
  const participantIds = Object.keys(shotsByParticipant).sort();
  const participantCount = Math.max(
    participantCountOverride ?? 0,
    participantIds.length,
    1
  );
  return { participantIds, participantCount };
}

/**
 * Loads every participant's shot at every slot index into `Image` elements,
 * shaped as `images[slotIndex][participantIndex]` — exactly the `StripImages`
 * shape `drawStrip` (lib/compositor.ts) expects. `null` entries (missing
 * shot / dropped participant) pass through as `null`, which `drawStrip`
 * already treats as "leave this sub-region showing the film-black
 * background."
 */
export async function loadStripImages(
  format: StripFormat,
  shotsByParticipant: SessionShotsMap,
  participantIds: string[]
): Promise<StripImages> {
  const slotCount = Number(format);
  const images: StripImages = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const row = await Promise.all(
      participantIds.map(async (participantId) => {
        const dataUrl = shotsByParticipant[participantId]?.[slotIndex] ?? null;
        return dataUrl ? loadImage(dataUrl) : null;
      })
    );
    images.push(row);
  }
  return images;
}

export interface CompositeStripInput {
  format: StripFormat;
  stylePreset: StylePreset;
  shotsByParticipant: SessionShotsMap;
  /** See `resolveParticipants` — authoritative count when the caller has one (e.g. GET /api/sessions/:id). */
  participantCount?: number;
}

/**
 * One-shot, atomic version of the render path: computes layout, loads every
 * shot, draws to an off-screen canvas, and flattens the result to a base64
 * data URL — the `imageDataUrl` `POST /api/strips` (lib/validation/strip.ts
 * `createStripSchema`) expects. Used by GenerateClient to produce the FINAL
 * strip once format/style are settled; this is a one-shot action (not tied
 * to a re-render effect), so it doesn't need StripPreview's
 * cancel-on-rerun guard.
 *
 * PNG by default — lossless, so the composited film-black background and
 * per-image style filter come through exactly as drawn (createStripSchema
 * also accepts JPEG, but nothing here needs the smaller-but-lossy tradeoff).
 */
export async function compositeStripToDataUrl(
  input: CompositeStripInput,
  mimeType: "image/png" | "image/jpeg" = "image/png"
): Promise<string> {
  const { participantIds, participantCount } = resolveParticipants(
    input.shotsByParticipant,
    input.participantCount
  );

  const layout = computeStripLayout(input.format, input.stylePreset, participantCount);

  const canvas = document.createElement("canvas");
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable — cannot composite final strip");
  }

  const images = await loadStripImages(input.format, input.shotsByParticipant, participantIds);
  drawStrip(ctx, layout, images, input.stylePreset);

  return canvas.toDataURL(mimeType);
}
