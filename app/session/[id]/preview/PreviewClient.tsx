"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import CameraView, { type CameraPermissionState } from "@/components/booth/CameraView";
import Countdown from "@/components/booth/Countdown";
import NumberedList from "@/components/ui/NumberedList";
import BoothFrame from "@/components/booth3d/BoothFrame";
import ScreenConsole from "@/components/booth3d/ScreenConsole";
import { MAX_PHOTOS } from "@/lib/captureBurst";
import { CAPTURE_JPEG_QUALITY, computeCaptureDimensions } from "@/lib/captureResolution";
import { loadStoredParticipant, type StoredParticipant } from "@/lib/participantStorage";
import { loadStoredShots, replaceShotAt, saveStoredShots } from "@/lib/shotStorage";
import { loadSessionShots, updateParticipantShots } from "@/lib/sessionShotsStorage";
import { broadcastShot, setRealtimeAuth } from "@/lib/realtime";

// Left-panel plates on the booth shell, plus the full-detail fallback list
// below `lg:` where those panels collapse out of view.
const PREVIEW_INSTRUCTIONS = [
  {
    title: "Check each frame",
    description: "Every shot you just took, in the order it lands on the strip.",
  },
  {
    title: "Retake any one",
    description: "A short countdown replaces just that frame — the rest stay put.",
  },
  {
    title: "Continue",
    description: "Move on to pick the look for the whole strip.",
  },
];

export interface PreviewClientProps {
  sessionId: string;
}

/**
 * Own-shots-only display decision: this screen shows only the current
 * participant's own MAX_PHOTOS shots, not every participant's relayed
 * shots. docs/online-photobooth-uiux-design-brief.md has no "preview &
 * retake" screen section (it jumps from "Countdown & synced capture"
 * straight to "Delivery / developing", i.e. the *final* strip reveal, not
 * this intermediate step) — so there's no design guidance calling for a
 * multi-participant view here. Retake is inherently a per-person action
 * (you can only retake your own shot), so a single-participant view is both
 * the simpler and the more correct UI for the action this screen exists to
 * support. lib/realtime.ts's shot-relay broadcast exists for the eventual
 * compositor's benefit (see the re-broadcast note on `finishRetake` below),
 * not for populating a shared preview UI.
 *
 * Retake re-broadcast decision: after a successful retake, the new frame IS
 * re-broadcast via `broadcastShot` (same relay path the original burst
 * used). This isn't a guess — lib/realtime.ts's `ShotRelayPayload` doc
 * comment already documents the resolved architecture: "each participant's
 * client broadcasts its captured shot to others over this channel so the
 * host can composite." Skipping the re-broadcast on retake would leave any
 * other participant's client (which independently composites its own strip
 * upload, per Phase 8's resolved design — see lib/compositor.ts) holding the
 * stale pre-retake frame if it's still subscribed.
 *
 * Resolved (Phase 8): a retake also updates THIS participant's entry in the
 * session-wide shot map (lib/sessionShotsStorage.ts#updateParticipantShots)
 * so /style's group-collage preview reflects the retake too — see
 * `finishRetake` below. CaptureClient persists the full map (its own shots
 * plus every relayed shot in `shotsRef`) right before navigating here; this
 * screen only ever needs to update its OWN entry within that already-hydrated
 * map, never another participant's.
 */

/**
 * Local-only 3-2-1 lead time before a retake capture fires. Deliberately
 * NOT lib/countdownSync.ts's server-anchored election/broadcast machinery —
 * retaking one of your own shots is a solo action. The group's one synced
 * moment already happened in Phase 6; re-running the sync/election dance
 * here would force the whole group through a second synced countdown just
 * because one participant wants to redo their own shot.
 */
const RETAKE_COUNTDOWN_MS = 3000;

function emptyShots(): (string | null)[] {
  return Array.from({ length: MAX_PHOTOS }, () => null);
}

type RetakeState =
  | { mode: "idle" }
  | {
      mode: "retaking";
      shotIndex: number;
      cameraState: CameraPermissionState;
      countdownTarget: number | null;
    };

export default function PreviewClient({ sessionId }: PreviewClientProps) {
  const router = useRouter();
  const [participant, setParticipant] = useState<StoredParticipant | null>(null);
  const [shots, setShots] = useState<(string | null)[]>(emptyShots());
  const [hydrated, setHydrated] = useState(false);
  const [retake, setRetake] = useState<RetakeState>({ mode: "idle" });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const retakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Hydrate from sessionStorage on mount — the hand-off CaptureClient.tsx
  // wrote (lib/shotStorage.ts#saveStoredShots) right before it navigated
  // here. Guards against a stale/mismatched entry (e.g. a previous
  // participant identity in the same tab) by requiring the stored shots'
  // participantId to match the stored participant's, when both exist.
  useEffect(() => {
    const storedParticipant = loadStoredParticipant(sessionId);
    setParticipant(storedParticipant);

    const storedShots = loadStoredShots(sessionId);
    if (
      storedShots &&
      (!storedParticipant || storedShots.participantId === storedParticipant.participantId)
    ) {
      setShots(storedShots.shots);

      // Safety net: CaptureClient normally persists the session-wide map
      // (lib/sessionShotsStorage.ts) before navigating here, so this
      // participant's entry should already exist. If it's somehow missing
      // (e.g. a direct/dev navigation to /preview), seed it from this
      // participant's own already-hydrated shots rather than leaving /style's
      // group preview with a hole for this participant.
      if (storedParticipant) {
        const sessionWide = loadSessionShots(sessionId);
        if (!sessionWide || !(storedParticipant.participantId in sessionWide)) {
          updateParticipantShots(sessionId, storedParticipant.participantId, storedShots.shots);
        }
      }
    }
    setHydrated(true);
  }, [sessionId]);

  // Re-authorize this participant's Realtime token — CaptureClient tore down
  // its own channel subscription (leaveSessionChannel) on unmount, so a
  // retaken shot's broadcastShot call needs auth set again before it can
  // send on session:{id}.
  useEffect(() => {
    if (!participant) return;
    void setRealtimeAuth(participant.realtimeToken);
  }, [participant]);

  useEffect(() => {
    return () => {
      if (retakeTimerRef.current) clearTimeout(retakeTimerRef.current);
    };
  }, []);

  const startRetake = useCallback((shotIndex: number) => {
    setRetake({ mode: "retaking", shotIndex, cameraState: "pending", countdownTarget: null });
  }, []);

  const cancelRetake = useCallback(() => {
    if (retakeTimerRef.current) {
      clearTimeout(retakeTimerRef.current);
      retakeTimerRef.current = null;
    }
    setRetake({ mode: "idle" });
  }, []);

  // Single-frame grab from the retake's live video element — same
  // resolution cap (lib/captureResolution.ts) and JPEG quality
  // CaptureClient.tsx's burst capture uses, so a retaken shot stays
  // consistent with the other three in size/quality.
  const captureRetakeFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video) return null;
    const { width, height } = computeCaptureDimensions(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", CAPTURE_JPEG_QUALITY);
  }, []);

  // Fires once the local retake countdown elapses. Replaces ONLY
  // `shotIndex` in state (lib/shotStorage.ts#replaceShotAt — verified by
  // construction in that module's tests to never touch other indices, and
  // to survive repeated retakes without duplicating/losing a shot: F-16 /
  // F-17), persists the updated array back to sessionStorage so the
  // hand-off stays current, and re-broadcasts the new frame (see this
  // file's top doc comment for why).
  const finishRetake = useCallback(
    (shotIndex: number) => {
      const dataUrl = captureRetakeFrame();
      retakeTimerRef.current = null;
      setRetake({ mode: "idle" });
      // No frame available (e.g. video unmounted mid-retake) — leave the
      // prior shot in place rather than clobber it with nothing.
      if (dataUrl === null) return;

      setShots((prev) => {
        const next = replaceShotAt(prev, shotIndex, dataUrl);
        if (participant) {
          saveStoredShots(sessionId, { participantId: participant.participantId, shots: next });
          // Keep the session-wide map (lib/sessionShotsStorage.ts) current so
          // /style's group-collage preview reflects this retake too — only
          // this participant's own entry is touched, mirroring
          // replaceShotAt's "only touch what you're told to" guarantee one
          // level up.
          updateParticipantShots(sessionId, participant.participantId, next);
        }
        return next;
      });

      if (participant) {
        void broadcastShot(sessionId, {
          participantId: participant.participantId,
          shotIndex,
          dataUrl,
        }).catch((err) => {
          console.error("[PreviewClient] failed to re-broadcast retaken shot", err);
        });
      }
    },
    [captureRetakeFrame, participant, sessionId]
  );

  // Once the retake's camera stream is granted, arm the local countdown
  // exactly once for this retake (guarded by countdownTarget !== null so
  // this doesn't re-arm on every re-render while retaking).
  useEffect(() => {
    if (retake.mode !== "retaking") return;
    if (retake.cameraState !== "granted") return;
    if (retake.countdownTarget !== null) return;

    const shotIndex = retake.shotIndex;
    const target = Date.now() + RETAKE_COUNTDOWN_MS;
    setRetake((prev) =>
      prev.mode === "retaking" && prev.shotIndex === shotIndex
        ? { ...prev, countdownTarget: target }
        : prev
    );
    retakeTimerRef.current = setTimeout(() => finishRetake(shotIndex), RETAKE_COUNTDOWN_MS);
  }, [retake, finishRetake]);

  const handleRetakeCameraChange = useCallback((cameraState: CameraPermissionState) => {
    setRetake((prev) => (prev.mode === "retaking" ? { ...prev, cameraState } : prev));
  }, []);

  const goToStyle = useCallback(() => {
    router.push(`/session/${sessionId}/style`);
  }, [router, sessionId]);

  const hasAnyShot = shots.some((shot) => shot !== null);
  const retaking = retake.mode === "retaking";

  if (hydrated && !hasAnyShot) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <Badge variant="warning">No shots found for this session yet.</Badge>
        <p className="font-sans text-sm text-ink-secondary">
          It looks like you haven&apos;t captured anything here — head back to the booth to take
          your photos first.
        </p>
        <Button variant="default" onClick={() => router.push(`/session/${sessionId}/capture`)}>
          Back to capture
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center gap-6 px-4 py-12">
      <BoothFrame
        pose="result"
        leftInstructions={PREVIEW_INSTRUCTIONS.map((item) => item.title)}
        rightLabel="REVIEW"
        rightSublabel="Retake before you commit"
      >
        {/* The booth's centre slot is a single screen, so a retake takes it
            over entirely — the live camera goes where the camera always goes
            (ScreenConsole, same as CaptureClient) rather than appearing as a
            second card floating beside the grid. */}
        {retaking ? (
          <ScreenConsole
            status={retake.countdownTarget !== null ? "countdown" : "active"}
            controlDeck={
              <div className="flex flex-col items-center gap-3">
                <p className="font-sans text-sm font-semibold text-ink">
                  Retaking shot {String(retake.shotIndex + 1).padStart(2, "0")}
                </p>
                <Countdown targetTimestamp={retake.countdownTarget} />
                <Button variant="default" onClick={cancelRetake}>
                  Cancel
                </Button>
              </div>
            }
          >
            <CameraView ref={videoRef} active onPermissionChange={handleRetakeCameraChange} />
          </ScreenConsole>
        ) : (
          <Card className="flex w-[min(92vw,420px)] flex-col gap-6 p-6 sm:p-8">
            <div className="animate-fade-up text-center">
              <p className="font-display text-sm text-rust-body">Preview</p>
              <h1 className="mt-2 font-display text-3xl text-ink">Review your shots</h1>
              <p className="mt-2 font-sans text-sm text-ink-secondary">
                Not happy with one? Retake it — the rest stay exactly as they are.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {shots.map((shot, index) => (
                <div key={index} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm text-rust-body tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {shot === null ? <Badge variant="warning">Missing</Badge> : null}
                  </div>
                  <div className="aspect-[3/4] w-full overflow-hidden rounded-booth border-booth-inner border-structural-gray bg-screen">
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element -- client-side-only data URL, never a remote/optimizable src.
                      <img
                        src={shot}
                        alt={`Shot ${index + 1} of ${MAX_PHOTOS}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-sans text-xs text-cream/70">Not captured</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="default"
                    disabled={retaking}
                    onClick={() => startRetake(index)}
                    className="w-full px-2 text-xs"
                  >
                    Retake
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="primary"
              disabled={retaking}
              onClick={goToStyle}
              className="w-full"
            >
              Continue to style →
            </Button>
          </Card>
        )}
      </BoothFrame>

      <div className="w-full max-w-2xl lg:hidden">
        <Card className="p-6 sm:p-8">
          <NumberedList items={PREVIEW_INSTRUCTIONS} layout="columns" />
        </Card>
      </div>
    </main>
  );
}
