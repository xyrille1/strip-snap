"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import SessionExpired from "@/components/booth/SessionExpired";
import BoothFrame from "@/components/booth3d/BoothFrame";
import { STYLE_PRESETS } from "@/lib/validation/strip";
import type { StripFormat, StylePreset } from "@/lib/compositor";
import { compositeStripToDataUrl } from "@/lib/compositeStrip";
import { loadSessionShots, type SessionShotsMap } from "@/lib/sessionShotsStorage";
import { loadSelectedStyle } from "@/lib/styleStorage";
import { loadStoredParticipant, saveStoredParticipant } from "@/lib/participantStorage";
import { saveGeneratedStripId } from "@/lib/stripStorage";
import { fetchSessionSummary } from "@/lib/booth/sessionSummary";

// Left-panel plates for the booth shell during the developing reveal.
const DEVELOPING_INSTRUCTIONS = [
  { title: "Exposing", description: "Your shots are being laid onto the strip." },
  { title: "Developing", description: "The image fades up as it comes into focus." },
  { title: "Delivering", description: "It drops into the chute when it's ready." },
];

export interface GenerateClientProps {
  sessionId: string;
}

/**
 * Screen phase. "choose" is where the resolved login-gate decision
 * (implementation-plan.md: "ONE logged-in participant unlocks the 4-photo
 * format for the whole session") actually gets exercised — it's only shown
 * when `GET /api/sessions/:id` reports the session is still on `format:
 * '3'`; if another participant already upgraded it, this client sees
 * `format: '4'` directly and skips straight to "developing" (F-24: the
 * unlock is session-wide, not per-viewer).
 */
type Phase =
  | "loading"
  | "no-shots"
  | "choose"
  | "developing"
  | "uploading"
  | "done"
  | "fatal"
  | "expired";

/** Timed reveal duration (design brief: "the strip inside visually 'develops' from faint gray to full color/contrast"). Functional, not final animation polish — Phase 13 owns further polish. */
const DEVELOP_COUNTDOWN_SECONDS = 3;
const REVEAL_TRANSITION_MS = 700;

export default function GenerateClient({ sessionId }: GenerateClientProps) {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();

  const [phase, setPhase] = useState<Phase>("loading");
  const [format, setFormat] = useState<StripFormat>("3");
  const [shotsByParticipant, setShotsByParticipant] = useState<SessionShotsMap>({});
  const [participantCount, setParticipantCount] = useState<number | undefined>(undefined);
  const [stylePreset, setStylePreset] = useState<StylePreset>(STYLE_PRESETS[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [wantsUpgrade, setWantsUpgrade] = useState(false);
  const [hasJoinedParticipant, setHasJoinedParticipant] = useState(true);

  const [developedDataUrl, setDevelopedDataUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DEVELOP_COUNTDOWN_SECONDS);
  const [revealed, setRevealed] = useState(false);

  // Guards duplicate work if effects re-fire (e.g. React StrictMode double-invoke in dev).
  const generateStartedRef = useRef(false);

  // 1. Hydrate session-wide shots (Phase 8 hand-off), the chosen style
  // preset (Phase 8 -> lib/styleStorage.ts), and this session's CURRENT
  // format from GET /api/sessions/:id (Phase 5) — the authoritative source
  // for whether the format choice is still open.
  useEffect(() => {
    let cancelled = false;

    const map = loadSessionShots(sessionId) ?? {};
    const preset = loadSelectedStyle(sessionId) ?? STYLE_PRESETS[0];
    const storedParticipant = loadStoredParticipant(sessionId);

    setShotsByParticipant(map);
    setStylePreset(preset);
    setHasJoinedParticipant(storedParticipant !== null);

    const hasAnyShot = Object.values(map).some((shots) => shots.some((shot) => shot !== null));
    if (!hasAnyShot) {
      setPhase("no-shots");
      return;
    }

    void fetchSessionSummary(sessionId).then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "expired" || outcome.kind === "not-found") {
        setPhase("expired");
        return;
      }
      if (outcome.kind !== "ok") {
        setErrorMessage("Could not load this session. Please try again.");
        setPhase("fatal");
        return;
      }
      setParticipantCount(outcome.summary.participantCount);
      setFormat(outcome.summary.format);
      // Already upgraded (by this or another participant) — resolved
      // one-logged-in-participant-unlocks-the-whole-session decision means
      // there's nothing left to choose; go straight to developing.
      setPhase(outcome.summary.format === "4" ? "developing" : "choose");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 2. Upgrade flow: re-links this now-authenticated Clerk identity to a
  // participants row for this session, then calls the Phase 1 upgrade
  // route. A participant who joined anonymously (joining never requires
  // login) has no participants row with `user_id` set yet, so
  // `/upgrade`'s `getParticipantByUserAndSession` check would 403 even
  // though this person genuinely joined earlier — re-calling `/join` now,
  // with the freshly established Clerk session, either creates that linked
  // row or returns the existing one (server-side idempotency,
  // app/api/sessions/[id]/join/route.ts), which is what actually prevents
  // the confusing 403 rather than just rewording the error after the fact.
  const runUpgrade = useCallback(async () => {
    const storedParticipant = loadStoredParticipant(sessionId);
    if (!storedParticipant) {
      setErrorMessage("Join this session before unlocking 4-photo mode.");
      setWantsUpgrade(false);
      return;
    }

    setUpgrading(true);
    setErrorMessage(null);
    try {
      const joinResponse = await fetch(`/api/sessions/${sessionId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: storedParticipant.displayName }),
      });
      if (!joinResponse.ok) {
        throw new Error("Could not confirm your participant identity for this session.");
      }
      const joinBody = (await joinResponse.json()) as {
        participant: { id: string };
        realtimeToken: string;
      };
      saveStoredParticipant(sessionId, {
        participantId: joinBody.participant.id,
        realtimeToken: joinBody.realtimeToken,
        displayName: storedParticipant.displayName,
      });
      setHasJoinedParticipant(true);

      const upgradeResponse = await fetch(`/api/sessions/${sessionId}/upgrade`, {
        method: "POST",
      });
      if (upgradeResponse.status === 401) {
        throw new Error("Sign-in did not complete. Please try again.");
      }
      if (upgradeResponse.status === 403) {
        throw new Error("You must join this session before unlocking 4-photo mode.");
      }
      if (!upgradeResponse.ok) {
        throw new Error("Could not unlock the 4-photo format. Please try again.");
      }

      setFormat("4");
      setPhase("developing");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong unlocking 4-photo mode."
      );
    } finally {
      setUpgrading(false);
      setWantsUpgrade(false);
    }
  }, [sessionId]);

  // Once Clerk reports a signed-in session AND the user asked to unlock
  // 4-photo (via the button below, whether or not a sign-in modal had to
  // open first), run the upgrade automatically — this is what keeps the
  // flow from stalling on a second manual click after the sign-in modal
  // closes (F-22/F-23: "session resumes at the same point").
  useEffect(() => {
    if (!authLoaded) return;
    if (wantsUpgrade && isSignedIn && !upgrading) {
      void runUpgrade();
    }
  }, [authLoaded, isSignedIn, wantsUpgrade, upgrading, runUpgrade]);

  function handleStayOnThree() {
    setErrorMessage(null);
    setFormat("3");
    setPhase("developing");
  }

  function handleRequestUnlock() {
    if (!hasJoinedParticipant) {
      setErrorMessage(
        "Join this session first (via the invite link or solo start) before unlocking 4-photo mode."
      );
      return;
    }
    setErrorMessage(null);
    setWantsUpgrade(true);
    if (isSignedIn) {
      void runUpgrade();
    }
    // If not signed in yet, the SignInButton below opens Clerk's modal;
    // the effect above picks up once `isSignedIn` flips to true.
  }

  // 3. Developing: composite the final flattened image (reusing Phase 8's
  // lib/compositor.ts draw path via lib/compositeStrip.ts — no
  // reimplementation of drawStrip here), then run a timed reveal per the
  // design brief's "delivery slot" moment, then upload.
  useEffect(() => {
    if (phase !== "developing" || generateStartedRef.current) return;
    generateStartedRef.current = true;

    let cancelled = false;

    void compositeStripToDataUrl({
      format,
      stylePreset,
      shotsByParticipant,
      participantCount,
    })
      .then((dataUrl) => {
        if (cancelled) return;
        setDevelopedDataUrl(dataUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage("Could not compose your strip. Please try again.");
        setPhase("fatal");
      });

    return () => {
      cancelled = true;
    };
  }, [phase, format, stylePreset, shotsByParticipant, participantCount]);

  // Countdown ticks purely for the "developing" display copy — the actual
  // reveal below is gated on `developedDataUrl` being ready, not on this
  // timer alone, so a slow composite never reveals a still-blank canvas.
  useEffect(() => {
    if (phase !== "developing") return;
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, secondsLeft]);

  // Reveal once both the countdown has visually run its course AND the
  // composite is ready, then upload.
  useEffect(() => {
    if (phase !== "developing") return;
    if (!developedDataUrl) return;
    if (secondsLeft > 0) return;
    if (revealed) return;

    const revealTimer = setTimeout(() => setRevealed(true), 50);
    return () => clearTimeout(revealTimer);
  }, [phase, developedDataUrl, secondsLeft, revealed]);

  useEffect(() => {
    if (!revealed || !developedDataUrl) return;
    const uploadTimer = setTimeout(() => {
      setPhase("uploading");
      void fetch("/api/strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          stylePreset,
          format,
          imageDataUrl: developedDataUrl,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Could not save your strip. Please try again.");
          }
          const body = (await response.json()) as { id: string };
          saveGeneratedStripId(sessionId, body.id);
          setPhase("done");
          router.push(`/session/${sessionId}/output`);
        })
        .catch((err) => {
          setErrorMessage(
            err instanceof Error ? err.message : "Could not save your strip. Please try again."
          );
          setPhase("fatal");
        });
    }, REVEAL_TRANSITION_MS);
    return () => clearTimeout(uploadTimer);
  }, [revealed, developedDataUrl, sessionId, stylePreset, format, router]);

  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="font-sans text-sm text-ink-secondary">Loading your session…</p>
      </main>
    );
  }

  if (phase === "no-shots") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <Badge variant="warning">No shots found for this session yet.</Badge>
        <p className="font-sans text-sm text-ink-secondary">
          Head back to the booth to capture your shots first.
        </p>
        <Button variant="default" onClick={() => router.push(`/session/${sessionId}/capture`)}>
          Back to capture
        </Button>
      </main>
    );
  }

  if (phase === "fatal") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <Badge variant="warning">{errorMessage ?? "Something went wrong."}</Badge>
        <Button variant="default" onClick={() => router.push(`/session/${sessionId}/style`)}>
          Back to style
        </Button>
      </main>
    );
  }

  if (phase === "expired") {
    return <SessionExpired sessionId={sessionId} />;
  }

  if (phase === "choose") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center gap-8 px-4 py-16 text-center">
        <div>
          <p className="font-display text-sm text-rust-body">Format</p>
          <h1 className="mt-2 font-display text-4xl text-ink">3 photos, or unlock 4?</h1>
          <p className="mt-3 font-sans text-sm text-ink-secondary">
            Signing in unlocks the 4-photo strip for everyone in this session — no extra cost,
            just an account.
          </p>
        </div>

        {errorMessage ? <Badge variant="warning">{errorMessage}</Badge> : null}

        <div className="grid w-full gap-4 sm:grid-cols-2">
          <Card className="flex flex-col items-center gap-3 p-6">
            <p className="font-sans text-sm font-semibold text-ink">Stay with 3 photos</p>
            <p className="font-sans text-xs text-ink-secondary">No sign-in needed.</p>
            <Button variant="default" onClick={handleStayOnThree}>
              Continue with 3 →
            </Button>
          </Card>

          <Card className="flex flex-col items-center gap-3 p-6">
            <p className="font-sans text-sm font-semibold text-ink">Unlock 4 photos</p>
            <p className="font-sans text-xs text-ink-secondary">Requires signing in.</p>
            {!hasJoinedParticipant ? (
              // Known-not-joined case, checked up front (lib/participantStorage.ts)
              // rather than letting the click open a sign-in modal that would
              // only end in a confusing 403 from /upgrade afterward.
              <p className="font-sans text-xs text-rust-body">
                Join this session first (via the invite link or solo start) to unlock 4 photos.
              </p>
            ) : isSignedIn ? (
              <Button
                variant="primary"
                onClick={handleRequestUnlock}
                disabled={upgrading}
              >
                {upgrading ? "Unlocking…" : "Unlock 4 →"}
              </Button>
            ) : (
              <SignInButton mode="modal">
                <Button
                  variant="primary"
                  onClick={handleRequestUnlock}
                  disabled={upgrading}
                >
                  {upgrading ? "Unlocking…" : "Sign in to unlock 4"}
                </Button>
              </SignInButton>
            )}
          </Card>
        </div>
      </main>
    );
  }

  // phase === "developing" | "uploading" | "done"
  // The booth's payoff moment — the strip is literally being delivered, so it
  // plays out inside the booth shell (right panel = the delivery chute) rather
  // than on a bare page.
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center gap-6 px-4 py-12">
      <BoothFrame
        pose="result"
        leftInstructions={DEVELOPING_INSTRUCTIONS.map((item) => item.title)}
        rightLabel="DELIVERY"
        rightSublabel="Photos drop here"
      >
        <Card className="flex w-[min(92vw,420px)] flex-col items-center gap-6 p-6 sm:p-8 text-center">
          <p className="font-display text-sm text-rust-body">Developing</p>

          <div
            className="flex h-[360px] w-full items-center justify-center overflow-hidden rounded-booth border-booth border-structural-gray bg-film-black p-2"
            aria-live="polite"
          >
            {developedDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote asset.
              <img
                src={developedDataUrl}
                alt="Your photo strip, developing"
                className="mx-auto block h-auto max-h-full w-auto max-w-full transition-all ease-out"
                style={{
                  transitionDuration: `${REVEAL_TRANSITION_MS}ms`,
                  opacity: revealed ? 1 : 0.35,
                  filter: revealed ? "none" : "grayscale(100%) blur(1px)",
                }}
              />
            ) : (
              <span className="font-sans text-sm text-cream/70">Preparing your shots…</span>
            )}
          </div>

          <p className="font-display text-2xl text-ink" role="status" aria-live="polite">
            {phase === "uploading"
              ? "Almost ready…"
              : secondsLeft > 0
                ? `Photos delivered here in ${secondsLeft}…`
                : "Developing…"}
          </p>
        </Card>
      </BoothFrame>
    </main>
  );
}
