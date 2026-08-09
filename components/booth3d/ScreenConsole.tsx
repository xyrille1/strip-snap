"use client";

import type { ReactNode } from "react";

export type ScreenStatus = "idle" | "active" | "countdown";

const STATUS_CLASSES: Record<ScreenStatus, string> = {
  idle: "bg-gray-400 opacity-20",
  active: "bg-green-400",
  countdown: "bg-red-500 animate-pulse",
};

export interface ScreenConsoleProps {
  status?: ScreenStatus;
  /** The camera/countdown/photo content that fills the black bezel. */
  children: ReactNode;
  /** Optional row under the screen (filter toggle, shutter button, etc.). */
  controlDeck?: ReactNode;
  className?: string;
}

/**
 * The booth's center "console" unit (docs/goal-ui.md's ScreenContent): a top
 * status light, a black bezel holding the live screen content, and an
 * optional control deck row underneath. Reused by CaptureClient (camera +
 * countdown) and PreviewClient's retake camera — both already own their own
 * video/overlay logic, this just supplies the surrounding chrome.
 */
export default function ScreenConsole({
  status = "idle",
  children,
  controlDeck,
  className,
}: ScreenConsoleProps) {
  return (
    <div
      className={[
        "w-full max-w-[360px] bg-panel border-booth border-structural-gray rounded-booth shadow-booth flex flex-col items-center p-4 relative",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="w-[160px] h-[22px] border-booth-inner border-structural-gray rounded-booth mb-4 flex items-center justify-center bg-white/5">
        <div
          className={`w-full h-full m-[2px] rounded-sm transition-colors duration-300 ${STATUS_CLASSES[status]}`}
        />
      </div>

      <div className="w-full aspect-[3/4] border-booth-inner border-structural-gray rounded-[8px] p-2 bg-black relative">
        {/* `absolute inset-0` (not flex) — a flex `items-center` cross-axis
            would size the video's block-level wrapper to fit-content instead
            of filling the box, collapsing CameraView's `w-full` video down to
            near-zero. Absolute positioning gives every child a definite
            containing block to size against, matching how CameraView is
            sized everywhere else it's used (a plain w-full block wrapper). */}
        <div className="absolute inset-0 rounded-[4px] overflow-hidden bg-screen">{children}</div>
      </div>

      {controlDeck ? <div className="w-full mt-4">{controlDeck}</div> : null}
    </div>
  );
}
