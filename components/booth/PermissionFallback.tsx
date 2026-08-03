import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

export interface PermissionFallbackProps {
  reason: "denied" | "unsupported" | "pending";
  /**
   * Present only when `CameraView` has determined a retry is actually
   * likely to work — i.e. re-invoking `getUserMedia()` will re-prompt the
   * browser's permission dialog rather than immediately reject again.
   * `CameraView` checks this via the Permissions API
   * (`navigator.permissions.query({ name: "camera" })`): a `"prompt"`
   * state means nothing has been permanently blocked yet, so a retry can
   * re-open the native prompt. A `"denied"` Permissions-API state, or the
   * Permissions API being unavailable at all (Safari has inconsistent
   * support), means we can't tell — and offering a button that silently
   * fails is worse than no button, so none is rendered and the copy below
   * explains the manual fix instead.
   */
  onRetry?: () => void;
}

const COPY: Record<PermissionFallbackProps["reason"], { title: string; body: string }> = {
  pending: {
    title: "Requesting camera access…",
    body: "Look for your browser's permission prompt and allow camera access to continue.",
  },
  denied: {
    title: "Camera access is blocked",
    body: "This booth needs your camera to capture the strip. If your browser can still prompt you, try again below — otherwise, allow camera access for this site in your browser's settings, then reload the page.",
  },
  unsupported: {
    title: "Camera isn't supported in this browser",
    body: "Try again in an up-to-date version of Chrome, Safari, Firefox, or Edge — this booth needs live camera access to capture your strip.",
  },
};

/**
 * Camera permission fallback, occupying the same footprint as the live
 * `<video>` preview it replaces (see `CameraView`'s `aspect-[3/4]` sizing)
 * so the surrounding layout never jumps between permission states.
 *
 * `role="status"` for the transient "requesting" state, `role="alert"` for
 * the two states that actually block capture (denied/unsupported) — both
 * paired with `aria-live="polite"` so a screen-reader user hears the state
 * change without needing to explore the page (test-plan A-04).
 */
export default function PermissionFallback({ reason, onRetry }: PermissionFallbackProps) {
  const copy = COPY[reason];
  const blocking = reason !== "pending";

  return (
    <div
      role={blocking ? "alert" : "status"}
      aria-live="polite"
      className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-4 bg-structural-gray/30 p-6 text-center"
    >
      <Badge variant={blocking ? "warning" : "default"}>
        {blocking ? "Camera unavailable" : "Waiting for camera"}
      </Badge>
      <div>
        <p className="font-sans text-sm font-semibold text-ink">{copy.title}</p>
        <p className="mt-2 max-w-[26ch] font-sans text-sm leading-relaxed text-ink-secondary">
          {copy.body}
        </p>
      </div>
      {onRetry ? (
        <Button variant="default" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
