"use client";

import type { ReactNode } from "react";
import { useBoothTheme } from "./BoothThemeProvider";
import { BoothPanelLeft, BoothPanelRight } from "./BoothPanels";

export type BoothPose = "setup" | "active" | "result";

const POSE_TRANSFORM: Record<BoothPose, string> = {
  setup: "rotateX(-6deg) rotateY(-14deg) scale(0.94) translateZ(-40px)",
  active: "rotateX(0deg) rotateY(0deg) scale(1) translateZ(0px)",
  result: "rotateX(4deg) rotateY(0deg) scale(0.92) translateZ(-60px)",
};

export interface BoothFrameProps {
  pose: BoothPose;
  leftInstructions: string[];
  rightLabel: string;
  rightSublabel: string;
  children: ReactNode;
}

/**
 * The 3D triptych booth shell (docs/goal-ui.md): a perspective container
 * holding PanelLeft, a center "screen" slot (the caller's own content — a
 * setup card, the live camera console, or the result photostrip), and
 * PanelRight, tilted per `pose`. Left/right panels are decorative chrome and
 * collapse below `lg:` (BoothPanels.tsx) so the center slot — the only piece
 * carrying real page content/interactivity — is never pushed off-screen on
 * narrow viewports.
 */
export default function BoothFrame({
  pose,
  leftInstructions,
  rightLabel,
  rightSublabel,
  children,
}: BoothFrameProps) {
  const { themeId } = useBoothTheme();

  return (
    <div
      className="relative w-full flex justify-center items-center py-10"
      style={{ perspective: "1400px" }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {themeId === "classic" ? (
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: "radial-gradient(circle at center, #000 2px, transparent 2px)",
              backgroundSize: "24px 24px",
            }}
          />
        ) : null}
        {themeId === "neon" ? (
          <>
            <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-pink-900/20 to-transparent" />
            <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-cyan-900/20 to-transparent" />
          </>
        ) : null}
        {themeId === "kawaii" ? (
          <div className="absolute w-[500px] h-[500px] bg-white/40 rounded-full blur-3xl opacity-60 -top-32 -left-32" />
        ) : null}
      </div>

      <div
        className="relative flex items-center gap-1 transition-transform duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transformStyle: "preserve-3d", transform: POSE_TRANSFORM[pose] }}
      >
        <div style={{ transform: "rotateY(20deg)", transformOrigin: "right center" }}>
          <BoothPanelLeft instructions={leftInstructions} />
        </div>

        <div style={{ transform: "translateZ(20px)" }} className="relative z-10">
          {children}
        </div>

        <div style={{ transform: "rotateY(-20deg)", transformOrigin: "left center" }}>
          <BoothPanelRight label={rightLabel} sublabel={rightSublabel} />
        </div>
      </div>
    </div>
  );
}
