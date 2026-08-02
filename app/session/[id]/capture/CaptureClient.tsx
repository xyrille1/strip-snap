"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import CameraView, { type CameraPermissionState } from "@/components/booth/CameraView";
import Countdown from "@/components/booth/Countdown";
import {
  broadcastCaptureAck,
  broadcastCountdownStart,
  broadcastShot,
  leaveSessionChannel,
  setRealtimeAuth,
  subscribeToCaptureAck,
  subscribeToCountdown,
  subscribeToPresence,
  subscribeToShots,
  trackPresence,
  type CaptureAckPayload,
  type ShotRelayPayload,
} from "@/lib/realtime";
import {
  fetchServerNow,
  startCountdownSync,
  type CountdownSyncHandle,
} from "@/lib/countdownSync";
import {
  MAX_PHOTOS,
  runCaptureBurst,
  type CaptureBurstHandle,
} from "@/lib/captureBurst";
import {
  loadStoredParticipant,
  saveStoredParticipant,
  type StoredParticipant,
} from "@/lib/participantStorage";
import { saveStoredShots } from "@/lib/shotStorage";
import { saveSessionShots, type SessionShotsMap } from "@/lib/sessionShotsStorage";
import { computeCaptureDimensions, CAPTURE_JPEG_QUALITY } from "@/lib/captureResolution";
// Reused as-is from Phase 5's waiting room (see that file's doc comment) —
// the same "all currently-connected, non-dropped participants are ready"
// signal drives the countdown election here, just observed on this page
// instead of the waiting room.
import { computeAllReady } from "@/app/session/[id]/waiting/WaitingClient";

export interface CaptureClientProps {
  sessionId: string;
}

/**
 * Default display name used only when this client reaches /capture with no
 * stored identity — i.e. solo mode (flows.md §1a skips the waiting room
 * entirely) or a direct navigation to /capture without ever joining. Well
 * within participants.display_name's 1-40 char constraint.
 */
const DEFAULT_DISPLAY_NAME = "Guest";

/**
 * Per the PRD's "Login gate note" (docs/online-photobooth-flows.md §3), the
 * 3-vs-4-photo format decision happens later, at "generate strip" — capture
 * happens *before* format is chosen, so it can't be format-aware. Every
 * capture always takes `MAX_PHOTOS` (lib/captureBurst.ts) shots via one
 * local rapid-fire burst after the single synced countdown trigger; the
 * generate step later decides how many of the 4 actually get composited.
 *
 * How long, after THIS client's own capture *burst* (all `MAX_PHOTOS` shots
 * + this participant's own capture_ack) completes, to keep waiting for
 * other participants' shots before proceeding anyway. Implements the
 * resolved dropped-participant assumption (proceed with an empty slot) — a
 * participant who never finishes their burst (because they dropped before
 * or during the capture window) must never block the rest of the group
 * indefinitely. Unchanged at 4s from the single-shot design: every
 * participant's burst runs on the same fixed local schedule starting from
 * the one shared synced trigger, so by the time THIS client's burst
 * finishes, everyone else's is finishing at roughly the same wall-clock
 * moment too — this window still only needs to cover normal network
 * latency for the last shot's broadcastShot to arrive, not the burst
 * duration itself.
 */
const SETTLE_TIMEOUT_MS = 4000;

/** Composite key so shotsRef can hold all `MAX_PHOTOS` shots per participant, not just one. */
function shotKey(participantId: string, shotIndex: number): string {
  return `${participantId}:${shotIndex}`;
}

function allShotIndices(): number[] {
  return Array.from({ length: MAX_PHOTOS }, (_, shotIndex) => shotIndex);
}

type Step =
  | { step: "resolving-identity" }
  | { step: "identity-error"; message: string }
  | { step: "active"; participant: StoredParticipant };

export default function CaptureClient({ sessionId }: CaptureClientProps) {
  const router = useRouter();
  const [state, setState] = useState<Step>({ step: "resolving-identity" });
  const [cameraState, setCameraState] = useState<CameraPermissionState>("pending");
  const [countdownTarget, setCountdownTarget] = useState<number | null>(null);
  const [captured, setCaptured] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const participantRef = useRef<StoredParticipant | null>(null);
  const syncStartedRef = useRef(false);
  const syncHandleRef = useRef<CountdownSyncHandle | null>(null);
  const burstHandleRef = useRef<CaptureBurstHandle | null>(null);
  const expectedParticipantsRef = useRef<Set<string>>(new Set());
  // Keyed by shotKey(participantId, shotIndex) — every participant
  // contributes MAX_PHOTOS shots per session (see the doc comment on
  // SETTLE_TIMEOUT_MS above for why capture is never format-aware).
  const shotsRef = useRef<Map<string, ShotRelayPayload>>(new Map());
  // capture_ack is a small, fast signal ("this participant has captured")
  // that can arrive before their much larger shot payload (a compressed
  // JPEG data URL) finishes broadcasting — used for the live "captured"
  // count so the UI feels responsive even before every image is in.
  // Advancing to /preview still waits on shotsRef (the actual images), not
  // this set.
  const ackedRef = useRef<Set<string>>(new Set());
  const navigatedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the latest `performCapture` (declared further below, after the
  // callbacks it depends on) so the countdown-election effect — which sets
  // up `onCaptureTime` only once, guarded by `syncStartedRef` — always
  // invokes the current version rather than one captured at setup time.
  const performCaptureRef = useRef<() => Promise<void>>(async () => {});

  // Hands off this participant's own captured shots to /preview via
  // lib/shotStorage.ts (sessionStorage, same keying convention as
  // lib/participantStorage.ts) — CaptureClient's shotsRef is a plain
  // in-memory useRef Map that would otherwise be lost the instant this
  // component unmounts on navigation. Only this participant's own
  // MAX_PHOTOS shots are persisted (see PreviewClient.tsx's doc comment for
  // why the preview screen is own-shots-only), keyed by participantId so a
  // missing shot (e.g. this participant dropped mid-burst) round-trips as
  // `null` rather than silently vanishing from the array.
  const persistOwnShotsForHandoff = useCallback(() => {
    const participant = participantRef.current;
    if (!participant) return;
    const shots = allShotIndices().map((shotIndex) => {
      const entry = shotsRef.current.get(shotKey(participant.participantId, shotIndex));
      return entry ? entry.dataUrl : null;
    });
    saveStoredShots(sessionId, { participantId: participant.participantId, shots });
  }, [sessionId]);

  // Hands off EVERY participant's shots (this participant's own plus every
  // relayed shot accumulated in shotsRef) to the session-wide store
  // (lib/sessionShotsStorage.ts) — resolves the gap Phase 7 flagged: nothing
  // previously persisted other participants' relayed shots past this
  // component's unmount, but Phase 8's compositor needs everyone's shots to
  // render a strip that shows the group "together" (each slot becomes a
  // collage of all participants' shots at that index — see
  // lib/compositor.ts). Built from expectedParticipantsRef (the non-dropped
  // participant set the countdown election locked in) rather than every key
  // ever seen in shotsRef, so a dropped participant's slot round-trips as
  // `null`s rather than being silently omitted from the map entirely.
  const persistAllShotsForHandoff = useCallback(() => {
    const expected = expectedParticipantsRef.current;
    const ids =
      expected.size > 0
        ? Array.from(expected)
        : participantRef.current
          ? [participantRef.current.participantId]
          : [];
    const map: SessionShotsMap = {};
    for (const id of ids) {
      map[id] = allShotIndices().map((shotIndex) => {
        const entry = shotsRef.current.get(shotKey(id, shotIndex));
        return entry ? entry.dataUrl : null;
      });
    }
    saveSessionShots(sessionId, map);
  }, [sessionId]);

  const goToPreview = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    persistOwnShotsForHandoff();
    persistAllShotsForHandoff();
    router.push(`/session/${sessionId}/preview`);
  }, [router, sessionId, persistOwnShotsForHandoff, persistAllShotsForHandoff]);

  const maybeAdvanceAfterShotUpdate = useCallback(() => {
    const expected = expectedParticipantsRef.current;
    if (expected.size === 0) return;
    const allShotsIn = Array.from(expected).every((id) =>
      allShotIndices().every((shotIndex) => shotsRef.current.has(shotKey(id, shotIndex)))
    );
    if (allShotsIn) goToPreview();
  }, [goToPreview]);

  // 1. Resolve identity: sessionStorage first (the invite-room path, saved
  // by WaitingClient after /join), else call /join directly with a default
  // name — this is what makes solo mode (which never visits /waiting) work.
  useEffect(() => {
    let cancelled = false;

    async function resolveIdentity() {
      const stored = loadStoredParticipant(sessionId);
      if (stored) {
        if (!cancelled) setState({ step: "active", participant: stored });
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${sessionId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: DEFAULT_DISPLAY_NAME }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            body?.error ?? "Couldn't join this session. Please try again."
          );
        }

        const body = (await response.json()) as {
          participant: { id: string; display_name: string };
          realtimeToken: string;
        };

        const joined: StoredParticipant = {
          participantId: body.participant.id,
          displayName: body.participant.display_name,
          realtimeToken: body.realtimeToken,
        };

        saveStoredParticipant(sessionId, joined);
        if (!cancelled) setState({ step: "active", participant: joined });
      } catch (err) {
        if (!cancelled) {
          setState({
            step: "identity-error",
            message:
              err instanceof Error
                ? err.message
                : "Couldn't join this session. Please try again.",
          });
        }
      }
    }

    void resolveIdentity();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    participantRef.current = state.step === "active" ? state.participant : null;
  }, [state]);

  // Leave the channel and cancel any pending timers on unmount (navigating
  // away from /capture entirely).
  useEffect(() => {
    return () => {
      leaveSessionChannel(sessionId);
      syncHandleRef.current?.stop();
      burstHandleRef.current?.stop();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [sessionId]);

  // 2a. Authorize the Realtime channel and announce presence as "connected"
  // as soon as identity resolves.
  useEffect(() => {
    if (state.step !== "active") return;
    const participant = state.participant;
    let cancelled = false;

    async function connect() {
      await setRealtimeAuth(participant.realtimeToken);
      if (cancelled) return;
      await trackPresence(sessionId, {
        participantId: participant.participantId,
        displayName: participant.displayName,
        status: "connected",
      });
    }

    void connect();
    return () => {
      cancelled = true;
    };
  }, [sessionId, state]);

  // 2b. Only flip to "ready" once the camera is actually granted — a
  // participant blocked on camera permission must never count toward
  // "all ready" (TRD §8: block entry to capture, don't let the group
  // proceed as if a blocked participant were ready).
  useEffect(() => {
    if (state.step !== "active") return;
    if (cameraState !== "granted") return;
    const participant = state.participant;

    void trackPresence(sessionId, {
      participantId: participant.participantId,
      displayName: participant.displayName,
      status: "ready",
    });
  }, [sessionId, state, cameraState]);

  // 2c. F-12: a camera-denied/unsupported participant can structurally never
  // become "ready" — without this, computeAllReady would wait on them
  // forever and the countdown would never start for anyone, turning one
  // person's blocked camera into a hang for the whole group (exactly what
  // TRD §8 and the resolved dropped-participant assumption both rule out).
  // Marking them "dropped" excludes them from computeAllReady's all-ready
  // check the same way a genuine disconnect would, letting the rest of the
  // group proceed with an empty slot for this participant.
  useEffect(() => {
    if (state.step !== "active") return;
    if (cameraState !== "denied" && cameraState !== "unsupported") return;
    const participant = state.participant;

    void trackPresence(sessionId, {
      participantId: participant.participantId,
      displayName: participant.displayName,
      status: "dropped",
    });
  }, [sessionId, state, cameraState]);

  // Pure single-frame grab from the live video element — the "local
  // capture-execution helper" lib/captureBurst.ts's `captureFrame` dep
  // calls once per shot in the burst. `shotIndex` doesn't affect what's
  // drawn (it's just "whatever the camera shows right now"); it's part of
  // the signature purely to match CaptureBurstDeps.
  const captureFrame = useCallback((shotIndex: number): string | null => {
    void shotIndex;
    const video = videoRef.current;
    if (!video) return null;

    // Capped via lib/captureResolution.ts (never upscaled, aspect-preserved)
    // so MAX_PHOTOS shots' base64 JPEG data URLs stay small enough for the
    // sessionStorage hand-off to /preview (see persistOwnShotsForHandoff
    // above and lib/shotStorage.ts's doc comment).
    const { width, height } = computeCaptureDimensions(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", CAPTURE_JPEG_QUALITY);
  }, []);

  // 5./6. Runs the local rapid-fire burst (lib/captureBurst.ts) once the
  // single synced countdown trigger fires — shot 0 is captured immediately,
  // at the precise server-anchored instant; shots 1-3 follow at fixed local
  // intervals, no re-election/re-broadcast per shot (TRD §3 only governs
  // the ONE synced trigger, not the local follow-up shots). Assigned into
  // performCaptureRef (declared above, with the other refs) so the
  // countdown-election effect below — set up only once, per syncStartedRef
  // — always invokes the latest version.
  const performCaptureBurst = useCallback(() => {
    const participant = participantRef.current;
    if (!participant) return;

    burstHandleRef.current = runCaptureBurst(
      {
        captureFrame,
        broadcastShot: (shotIndex, dataUrl) =>
          broadcastShot(sessionId, {
            participantId: participant.participantId,
            shotIndex,
            dataUrl,
          }),
        onShotCaptured: (shotIndex, dataUrl) => {
          // Raw shots stay client-side (TRD/PRD privacy requirement) — only
          // relayed over the transient Realtime broadcast channel, never
          // written to a table or Storage.
          shotsRef.current.set(shotKey(participant.participantId, shotIndex), {
            participantId: participant.participantId,
            shotIndex,
            dataUrl,
          });
          maybeAdvanceAfterShotUpdate();
        },
      },
      {
        // Fires only once all MAX_PHOTOS shots are captured and broadcast —
        // never after shot 0 alone. This is the single point this
        // participant is considered "done": capture_ack broadcasts and the
        // "captured" presence status both wait for the whole burst, not
        // the first shot.
        onComplete: () => {
          ackedRef.current.add(participant.participantId);
          setCaptured(true);
          setCapturedCount(ackedRef.current.size);

          void Promise.allSettled([
            broadcastCaptureAck(sessionId, { participantId: participant.participantId }),
            trackPresence(sessionId, {
              participantId: participant.participantId,
              displayName: participant.displayName,
              status: "captured",
            }),
          ]).then(() => {
            // Resolved dropped-participant handling: proceed once every
            // expected participant's full burst is in, or after
            // SETTLE_TIMEOUT_MS, whichever comes first — never hang
            // indefinitely on a participant who dropped.
            settleTimerRef.current = setTimeout(goToPreview, SETTLE_TIMEOUT_MS);
            maybeAdvanceAfterShotUpdate();
          });
        },
      }
    );
  }, [sessionId, captureFrame, goToPreview, maybeAdvanceAfterShotUpdate]);

  // Keep the ref pointed at the latest closure on every render (cheap plain
  // assignment, not a hook — order relative to hooks doesn't matter here).
  performCaptureRef.current = async () => {
    performCaptureBurst();
  };

  // 3./4. Countdown election + server-anchored scheduling (lib/countdownSync.ts),
  // started exactly once, the first time presence reports every currently
  // connected participant ready.
  useEffect(() => {
    if (state.step !== "active") return;

    const unsubscribe = subscribeToPresence(sessionId, (states) => {
      if (syncStartedRef.current) return;
      if (!computeAllReady(states)) return;

      syncStartedRef.current = true;
      const expected = new Set(
        states.filter((s) => s.status !== "dropped").map((s) => s.participantId)
      );
      expectedParticipantsRef.current = expected;
      setExpectedCount(expected.size);

      syncHandleRef.current = startCountdownSync(
        {
          fetchServerNow,
          broadcastCountdownStart: (payload) =>
            broadcastCountdownStart(sessionId, payload),
          subscribeToCountdown: (onStart) => subscribeToCountdown(sessionId, onStart),
        },
        {
          onScheduled: (localTargetEpoch) => setCountdownTarget(localTargetEpoch),
          onCaptureTime: () => {
            void performCaptureRef.current();
          },
        }
      );
    });

    return unsubscribe;
  }, [sessionId, state.step]);

  // Accumulate other participants' relayed shots/acks in memory (never
  // persisted — TRD's client-side-only privacy requirement).
  useEffect(() => {
    if (state.step !== "active") return;

    const unsubShots = subscribeToShots(sessionId, (payload) => {
      shotsRef.current.set(shotKey(payload.participantId, payload.shotIndex), payload);
      maybeAdvanceAfterShotUpdate();
    });
    const unsubAcks = subscribeToCaptureAck(sessionId, (payload: CaptureAckPayload) => {
      ackedRef.current.add(payload.participantId);
      setCapturedCount(ackedRef.current.size);
    });

    return () => {
      unsubShots();
      unsubAcks();
    };
  }, [sessionId, state.step, maybeAdvanceAfterShotUpdate]);

  if (state.step === "resolving-identity") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl items-center justify-center px-4 py-16">
        <p className="font-sans text-sm text-ink-secondary">Joining the booth…</p>
      </main>
    );
  }

  if (state.step === "identity-error") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <Badge variant="warning">{state.message}</Badge>
        <Button variant="default" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  const blocked = cameraState === "denied" || cameraState === "unsupported";

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="text-center">
        <p className="font-display text-sm italic text-rust-body">Capture</p>
        <h1 className="mt-2 font-display text-4xl italic text-ink">
          {blocked ? "Camera needed to continue" : "Hold still — the strip is coming"}
        </h1>
      </div>

      <Card className="w-full overflow-hidden p-0">
        <CameraView ref={videoRef} active onPermissionChange={setCameraState} />
      </Card>

      {!blocked ? (
        <>
          <Countdown targetTimestamp={countdownTarget} />
          {captured ? (
            <Badge variant="success">
              Captured — waiting on the rest of the group ({capturedCount}/
              {Math.max(expectedCount, 1)})
            </Badge>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
