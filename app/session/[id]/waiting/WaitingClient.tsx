"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PresenceList from "@/components/booth/PresenceList";
import ReadyToggle from "@/components/booth/ReadyToggle";
import SessionExpired from "@/components/booth/SessionExpired";
import BoothFrame from "@/components/booth3d/BoothFrame";
import { UsersIcon } from "@/components/booth3d/icons";
import {
  leaveSessionChannel,
  setRealtimeAuth,
  subscribeToPresence,
  trackPresence,
  type PresenceState,
} from "@/lib/realtime";
import { loadStoredParticipant, saveStoredParticipant } from "@/lib/participantStorage";

export interface WaitingClientProps {
  sessionId: string;
}

interface SessionSummary {
  id: string;
  mode: "solo" | "invite";
  format: "3" | "4";
  status: "waiting" | "counting" | "capturing" | "done" | "expired";
}

interface ParticipantSummary {
  id: string;
  display_name: string;
  status: PresenceState["status"];
}

interface JoinedParticipant {
  id: string;
  displayName: string;
  realtimeToken: string;
}

type PageState =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "expired" }
  | {
      step: "name-entry";
      session: SessionSummary;
      participants: ParticipantSummary[];
    }
  | {
      step: "connected";
      session: SessionSummary;
      participants: ParticipantSummary[];
      participant: JoinedParticipant;
    };

const INSTRUCTIONS = [
  {
    title: "Share the link",
    description: "Send the invite link below to anyone joining this strip.",
  },
  {
    title: "Wait for everyone",
    description: "Watch the presence list — you'll see each person as they connect.",
  },
  {
    title: "Mark yourself ready",
    description: "Once everyone taps ready, the synced countdown starts automatically.",
  },
];

/**
 * Derives F-09's "all ready" auto-start signal purely from what
 * `lib/realtime.ts#subscribeToPresence` already exposes, so Phase 6 can wire
 * the actual `broadcastCountdownStart` trigger here without re-plumbing
 * presence. A `dropped` participant doesn't block the remaining group
 * (matches the resolved dropped-participant assumption — proceed with an
 * empty slot). An empty room is never "all ready".
 */
export function computeAllReady(states: PresenceState[]): boolean {
  const active = states.filter((state) => state.status !== "dropped");
  if (active.length === 0) return false;
  return active.every((state) => state.status === "ready");
}

function inviteUrl(sessionId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/session/${sessionId}/waiting`;
}

export default function WaitingClient({ sessionId }: WaitingClientProps) {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ step: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const [selfReady, setSelfReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (cancelled) return;

        if (response.status === 404) {
          // Expire-sessions cron already hard-deleted this session
          // (backend-schema §7) — same end state as status === "expired"
          // below, just discovered via a 404 instead of the row itself.
          setState({ step: "expired" });
          return;
        }

        if (!response.ok) {
          setState({
            step: "error",
            message: "Couldn't load this session. Please try again.",
          });
          return;
        }

        const body = (await response.json()) as {
          session: SessionSummary;
          participants: ParticipantSummary[];
        };

        if (body.session.status === "expired") {
          setState({ step: "expired" });
          return;
        }

        setState({
          step: "name-entry",
          session: body.session,
          participants: body.participants,
        });
      } catch {
        if (!cancelled) {
          setState({
            step: "error",
            message: "Couldn't reach the server. Check your connection and try again.",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Leave the Realtime channel when navigating away from the waiting room
  // entirely (e.g. back to the landing page) — CaptureClient re-joins it
  // fresh via getSessionChannel's per-sessionId cache.
  useEffect(() => {
    return () => {
      leaveSessionChannel(sessionId);
    };
  }, [sessionId]);

  // Once we're connected, subscribe to presence purely to derive the
  // auto-start signal (F-09) and this client's own ready state — PresenceList
  // owns the rendered list via its own independent subscription.
  useEffect(() => {
    if (state.step !== "connected") return;
    const participant = state.participant;

    const unsubscribe = subscribeToPresence(sessionId, (states) => {
      setAllReady(computeAllReady(states));
      const self = states.find((s) => s.participantId === participant.id);
      setSelfReady(self?.status === "ready");
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- state.participant is stable while step === "connected"
  }, [sessionId, state.step]);

  // F-09 auto-start, second half (Phase 6): the moment presence reports
  // everyone ready, every connected client navigates itself to /capture —
  // there's no host-triggered alternative to wait for. CaptureClient then
  // re-joins the Realtime channel fresh (see the cleanup effect above) and
  // runs the actual self-electing countdown_start trigger
  // (lib/countdownSync.ts) once it observes the same all-ready state.
  // Guarded by a ref (not just `allReady`) so a stray extra presence sync
  // after navigation has already been requested can't call router.push twice.
  const hasNavigatedToCaptureRef = useRef(false);
  useEffect(() => {
    if (!allReady) return;
    if (hasNavigatedToCaptureRef.current) return;
    hasNavigatedToCaptureRef.current = true;
    router.push(`/session/${sessionId}/capture`);
  }, [allReady, router, sessionId]);

  const handleJoin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (state.step !== "name-entry") return;

      const trimmed = displayName.trim();
      if (trimmed.length === 0) {
        setJoinError("Enter a name so others can recognize you.");
        return;
      }

      setJoining(true);
      setJoinError(null);

      try {
        // If this browser already has a stored identity for this session
        // (the session creator's own `Host` row — see ModeSelectClient's
        // doc comment), pass its id along so /join renames that existing
        // row to the name just typed instead of inserting a second,
        // disconnected row for the same physical person. A genuine
        // first-time joiner (fresh browser/tab, no stored identity) omits
        // this and gets the normal fresh-row behavior.
        const existing = loadStoredParticipant(sessionId);
        const response = await fetch(`/api/sessions/${sessionId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: trimmed,
            ...(existing ? { participantId: existing.participantId } : {}),
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Couldn't join this session. Please try again.");
        }

        const body = (await response.json()) as {
          participant: { id: string; display_name: string };
          realtimeToken: string;
        };

        const joined: JoinedParticipant = {
          id: body.participant.id,
          displayName: body.participant.display_name,
          realtimeToken: body.realtimeToken,
        };

        // Persist identity across navigation (Phase 6): WaitingClient's own
        // React state doesn't survive the browser navigating from /waiting
        // to /capture. CaptureClient reads this same sessionStorage shape
        // first, before falling back to its own /join call (solo mode).
        saveStoredParticipant(sessionId, {
          participantId: joined.id,
          realtimeToken: joined.realtimeToken,
          displayName: joined.displayName,
        });

        // Realtime Authorization: must be awaited BEFORE the channel
        // subscribes (subscribeToPresence/trackPresence below trigger the
        // actual channel.subscribe() call) — see lib/realtime.ts#setRealtimeAuth.
        await setRealtimeAuth(joined.realtimeToken);
        await trackPresence(sessionId, {
          participantId: joined.id,
          displayName: joined.displayName,
          status: "connected",
        });

        setState({
          step: "connected",
          session: state.session,
          participants: state.participants,
          participant: joined,
        });
      } catch (err) {
        setJoinError(
          err instanceof Error ? err.message : "Couldn't join this session. Please try again."
        );
      } finally {
        setJoining(false);
      }
    },
    [displayName, sessionId, state]
  );

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl(sessionId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setJoinError("Couldn't copy the link — copy it manually from the address bar.");
    }
  }

  if (state.step === "loading") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl items-center justify-center px-4 py-16">
        <p className="font-sans text-sm text-ink-secondary">Loading session…</p>
      </main>
    );
  }

  if (state.step === "error") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <Badge variant="warning">{state.message}</Badge>
        <Button variant="default" onClick={() => router.push("/")}>
          Back to start
        </Button>
      </main>
    );
  }

  if (state.step === "expired") {
    return <SessionExpired sessionId={sessionId} />;
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center gap-6 px-4 py-12">
      <BoothFrame
        pose="setup"
        leftInstructions={INSTRUCTIONS.map((item) => item.title)}
        rightLabel="WAITING"
        rightSublabel="For your friends"
      >
        <div className="flex w-[min(92vw,420px)] flex-col gap-6">
          <div className="text-center">
            <p className="font-display text-sm text-rust-body">Waiting room</p>
            <h1 className="mt-2 font-display text-3xl text-ink">
              Gathering everyone in the booth
            </h1>
          </div>

          <Card className="flex flex-col gap-3 p-6">
            <div className="min-w-0">
              <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Invite link
              </p>
              <p className="mt-1 truncate font-sans text-sm text-ink">{inviteUrl(sessionId)}</p>
            </div>
            <Button variant="default" onClick={handleCopyLink} className="shrink-0">
              {copied ? "Copied" : "Copy link"}
            </Button>
          </Card>

          {state.step === "name-entry" ? (
            <Card className="flex flex-col gap-4 p-6">
              <form onSubmit={handleJoin} className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="font-sans text-sm font-medium text-ink">Your name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={40}
                    required
                    placeholder="e.g. Priya"
                    className="rounded-booth border-booth-inner border-structural-gray bg-cream px-4 py-2.5 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  />
                </label>
                {joinError ? (
                  <div role="alert">
                    <Badge variant="warning">{joinError}</Badge>
                  </div>
                ) : null}
                <Button
                  type="submit"
                  variant="default"
                  className="w-full py-3.5 text-base"
                  disabled={joining}
                  aria-busy={joining}
                >
                  {joining ? "Joining…" : "Join waiting room"}
                </Button>
              </form>
            </Card>
          ) : (
            <>
              <Card className="flex flex-col items-center gap-3 p-6 text-center">
                <span className="text-rust-body animate-spin">
                  <UsersIcon size={28} />
                </span>
                <p className="font-sans text-sm text-ink-secondary">
                  Watching for everyone to join and get ready…
                </p>
              </Card>

              <PresenceList
                sessionId={sessionId}
                participants={state.participants.map((p) => ({
                  id: p.id,
                  displayName: p.display_name,
                  status: p.status,
                }))}
              />

              <div className="flex flex-col items-center gap-4">
                <ReadyToggle
                  sessionId={sessionId}
                  participantId={state.participant.id}
                  displayName={state.participant.displayName}
                  isReady={selfReady}
                  onToggle={setSelfReady}
                />
                {allReady ? (
                  <div role="status" aria-live="polite">
                    <Badge variant="success">Everyone&apos;s ready — starting soon</Badge>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </BoothFrame>
    </main>
  );
}
