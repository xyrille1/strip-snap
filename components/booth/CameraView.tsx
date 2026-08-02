"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import PermissionFallback from "./PermissionFallback";

/** Mirrors PermissionFallback's `reason` union, plus "granted" for the live-preview state. */
export type CameraPermissionState = "pending" | "granted" | "denied" | "unsupported";

export interface CameraViewProps {
  /** Whether the parent wants the camera stream requested/live. Flipping to false tears the stream down. */
  active: boolean;
  /**
   * Fires whenever the permission/support state changes, so the parent
   * (CaptureClient) can block entry to capture — TRD §8: camera-denied or
   * unsupported-browser must show an explicit fallback and block entry, not
   * silently fail or hang.
   */
  onPermissionChange?: (state: CameraPermissionState) => void;
}

/**
 * Live camera preview via `getUserMedia`. Requests access as soon as
 * `active` becomes true — CaptureClient renders this once identity has
 * resolved, well before presence reports "all ready" and long before the
 * countdown can be scheduled, so there's ample time for the permission
 * prompt to be shown and answered before capture can possibly fire.
 * Forwards a ref to the underlying `<video>` element so the parent can draw
 * frames from it at capture time without a second, duplicate stream.
 *
 * The `<video>` element is always mounted (even while not yet granted) so
 * the ref exists before the stream resolves — assigning `srcObject` only
 * after conditionally rendering the element would race against React not
 * having mounted it yet.
 */
const CameraView = forwardRef<HTMLVideoElement, CameraViewProps>(function CameraView(
  { active, onPermissionChange },
  forwardedRef
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraPermissionState>("pending");

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement);

  useEffect(() => {
    if (!active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      onPermissionChange?.("unsupported");
      return;
    }

    let cancelled = false;
    setState("pending");
    onPermissionChange?.("pending");

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setState("granted");
        onPermissionChange?.("granted");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // `NotAllowedError` is the explicit permission-denied case TRD §8
        // calls out. Any other getUserMedia failure (no camera device,
        // device already in use, etc.) is treated the same way — an
        // explicit blocking fallback, not a silent failure or hung screen.
        console.error("[CameraView] getUserMedia failed", err);
        setState("denied");
        onPermissionChange?.("denied");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPermissionChange is expected to be a stable callback from the parent; re-running this effect on every parent render would re-request the camera stream unnecessarily.
  }, [active]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={
          state === "granted"
            ? "aspect-[3/4] w-full bg-ink object-cover"
            : "hidden"
        }
      />
      {state !== "granted" ? <PermissionFallback reason={state} /> : null}
    </div>
  );
});

export default CameraView;
