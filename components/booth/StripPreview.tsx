"use client";

import { useEffect, useRef } from "react";
import { computeStripLayout, drawStrip, type StripFormat, type StylePreset } from "@/lib/compositor";
import { loadStripImages, resolveParticipants } from "@/lib/compositeStrip";

export interface StripPreviewProps {
  format: StripFormat;
  stylePreset: StylePreset;
  /** participantId -> shots (index-aligned with slot index), per lib/sessionShotsStorage.ts's SessionShotsMap shape. */
  shotsByParticipant: Record<string, (string | null)[]>;
  /**
   * Authoritative participant count for this session (e.g. from
   * `GET /api/sessions/:id`), when the caller has it. Falls back to
   * `Object.keys(shotsByParticipant).length` when omitted. Passing this
   * explicitly matters when a participant has an all-null entry (dropped
   * before capturing anything) or hasn't hydrated into the shot map yet —
   * the grid should still reserve their slot space rather than silently
   * shrinking the collage.
   */
  participantCount?: number;
}

/**
 * Live Canvas-composited strip preview. Loads every participant's shot data
 * URLs into `Image` elements, then redraws via `lib/compositor.ts` whenever
 * `stylePreset` (or the shots/format) changes.
 *
 * F-19 (switching presets before confirming updates the preview each time,
 * with no stale preset bleeding into the next selection) is satisfied by
 * construction here, not just by convention: the draw effect below is keyed
 * on `[format, stylePreset, shotsByParticipant]`, and every run performs a
 * full clear-and-redraw (`drawStrip` fills the film-black background then
 * draws every image fresh with the CURRENT preset's filter — see that
 * function's doc comment) rather than layering a new preset's draw on top of
 * a previous one. There is no accumulating state carried between draws.
 */
export default function StripPreview({
  format,
  stylePreset,
  shotsByParticipant,
  participantCount: participantCountOverride,
}: StripPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { participantIds, participantCount } = resolveParticipants(
    shotsByParticipant,
    participantCountOverride
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    // Re-bind to a new const so TS retains the non-null narrowing inside the
    // nested `render` closure below (narrowing on the outer `const` isn't
    // otherwise carried into a function declaration defined further down).
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const layout = computeStripLayout(format, stylePreset, participantCount);
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    let cancelled = false;

    async function render() {
      // images[slotIndex][participantIndex] — matches drawStrip's expected
      // StripImages shape (lib/compositor.ts). Participant order is fixed
      // (sorted participantIds) so a re-render never shuffles which
      // sub-region belongs to which participant. Shared with
      // GenerateClient's final-composite path via lib/compositeStrip.ts
      // rather than duplicating this image-loading loop.
      const images = await loadStripImages(format, shotsByParticipant, participantIds);

      if (cancelled) return;
      drawStrip(ctx, layout, images, stylePreset);
    }

    void render();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shotsByParticipant is a plain object; participantIds/participantCount are derived from it (and participantCountOverride) each render and don't need separate listing.
  }, [format, stylePreset, shotsByParticipant, participantCountOverride]);

  const hasAnyShot = participantIds.some((id) =>
    (shotsByParticipant[id] ?? []).some((shot) => shot !== null)
  );

  return (
    <div className="w-full overflow-hidden rounded-card-lg border border-hairline border-structural-gray bg-film-black p-2">
      {hasAnyShot ? (
        <canvas ref={canvasRef} className="mx-auto block h-auto max-w-full" />
      ) : (
        <p className="py-16 text-center font-sans text-sm text-cream/70">No shots yet.</p>
      )}
    </div>
  );
}
