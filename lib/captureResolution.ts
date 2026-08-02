/**
 * Shared resolution cap for camera frame captures — used by both the initial
 * capture burst (app/session/[id]/capture/CaptureClient.tsx's `captureFrame`,
 * called from lib/captureBurst.ts) and single-frame retakes
 * (app/session/[id]/preview/PreviewClient.tsx).
 *
 * `CameraView.tsx` requests `getUserMedia({ video: { facingMode: "user" } })`
 * with no explicit width/height constraints, so the browser is free to hand
 * back its native/default resolution — on some webcams/laptops that's
 * 1920x1080 or higher. Left uncapped, persisting a MAX_PHOTOS=4-shot burst's
 * base64 JPEG data URLs (lib/shotStorage.ts's capture→preview hand-off) could
 * approach or exceed `sessionStorage`'s ~5-10MB per-origin quota. Capping
 * every captured frame to fit within these bounds — while preserving aspect
 * ratio and never upscaling a smaller source — keeps a full 4-shot burst
 * comfortably under ~1MB in the typical case, so `sessionStorage` (already
 * used by lib/participantStorage.ts) stays safe to reuse for shots too,
 * without needing a second persistence mechanism (e.g. IndexedDB).
 */

export const MAX_CAPTURE_WIDTH = 720;
export const MAX_CAPTURE_HEIGHT = 960;

/** JPEG encode quality used for every captured frame — matches the value CaptureClient.tsx/PreviewClient.tsx both pass to `canvas.toDataURL`. */
export const CAPTURE_JPEG_QUALITY = 0.85;

export interface CaptureDimensions {
  width: number;
  height: number;
}

/**
 * Computes canvas capture dimensions that fit within `maxWidth`x`maxHeight`
 * while preserving the source's aspect ratio — only ever shrinks a source
 * larger than the cap, never upscales a smaller one. Falls back to the max
 * bounds when a native dimension is not yet known (0 or negative, e.g. the
 * video element hasn't loaded metadata yet).
 */
export function computeCaptureDimensions(
  nativeWidth: number,
  nativeHeight: number,
  maxWidth: number = MAX_CAPTURE_WIDTH,
  maxHeight: number = MAX_CAPTURE_HEIGHT
): CaptureDimensions {
  const safeWidth = nativeWidth > 0 ? nativeWidth : maxWidth;
  const safeHeight = nativeHeight > 0 ? nativeHeight : maxHeight;
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}
