"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import PermissionFallback from "./PermissionFallback";

/**
 * True only for the specific browser-level permission-denial case TRD §8
 * calls out (the user explicitly blocked/dismissed the camera prompt) —
 * distinct from other getUserMedia failures (no device, device busy, etc.)
 * which the UI still treats as "denied" but which ops-runbook.md §7 doesn't
 * ask to be individually instrumented.
 */
function isPermissionDeniedError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "NotAllowedError"
  );
}

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
  // Bumped by handleRetry to force the request effect below to re-run even
  // though `active` hasn't changed — re-invoking getUserMedia() is exactly
  // what "try again" means here (Phase 13 polish pass, PermissionFallback's
  // retry affordance).
  const [retryToken, setRetryToken] = useState(0);
  // Whether the Permissions API reports a retry is actually likely to
  // re-prompt (see PermissionFallback's doc comment on why this matters).
  const [canRetry, setCanRetry] = useState(false);

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement);

  useEffect(() => {
    if (!active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      onPermissionChange?.("unsupported");
      // ops-runbook.md §7: camera permission denials/unsupported-browser
      // instrumentation.
      Sentry.captureException(
        new Error("getUserMedia is not supported in this browser"),
        { tags: { area: "camera_permission", reason: "unsupported" } }
      );
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
        if (isPermissionDeniedError(err)) {
          // ops-runbook.md §7: camera permission denials instrumentation —
          // only the explicit NotAllowedError case, not every getUserMedia
          // failure (see isPermissionDeniedError's doc comment).
          Sentry.captureException(err, {
            tags: { area: "camera_permission", reason: "denied" },
          });
        }
        setState("denied");
        onPermissionChange?.("denied");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPermissionChange is expected to be a stable callback from the parent; re-running this effect on every parent render would re-request the camera stream unnecessarily.
  }, [active, retryToken]);

  // Once denied, ask the Permissions API (where available) whether camera
  // access is merely at the "prompt" stage (a retry can re-open the native
  // dialog) or genuinely "denied" at the browser level (a retry will just
  // reject again with no dialog shown at all) — PermissionFallback only
  // renders a "Try again" button when this resolves true, per its own doc
  // comment on not offering a control that silently does nothing.
  useEffect(() => {
    if (state !== "denied") {
      setCanRetry(false);
      return;
    }
    if (!navigator.permissions?.query) {
      // Can't verify (e.g. Safari's inconsistent Permissions API support)
      // — stay conservative and don't offer a retry that might be a no-op.
      setCanRetry(false);
      return;
    }

    let cancelled = false;
    navigator.permissions
      .query({ name: "camera" })
      .then((status) => {
        if (cancelled) return;
        setCanRetry(status.state === "prompt");
        status.onchange = () => {
          if (cancelled) return;
          setCanRetry(status.state === "prompt");
        };
      })
      .catch(() => {
        if (!cancelled) setCanRetry(false);
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  function handleRetry() {
    setRetryToken((token) => token + 1);
  }

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
      {state !== "granted" ? (
        <PermissionFallback
          reason={state}
          onRetry={state === "denied" && canRetry ? handleRetry : undefined}
        />
      ) : null}
    </div>
  );
});

export default CameraView;
