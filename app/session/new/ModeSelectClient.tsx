"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import NumberedList from "@/components/ui/NumberedList";
import BoothFrame from "@/components/booth3d/BoothFrame";
import ThemeSelector from "@/components/booth3d/ThemeSelector";
import { UserIcon, UsersIcon } from "@/components/booth3d/icons";
import { saveStoredParticipant } from "@/lib/participantStorage";

type Mode = "solo" | "invite";

interface CreateSessionResponse {
  id: string;
  join_url: string;
  participant: { id: string; display_name: string };
  realtimeToken: string;
}

// flows.md §1a: solo skips straight to capture; invite goes to the waiting
// room. Solo's own client ignores the API's join_url and navigates here
// directly with the returned session id.
function nextPathFor(mode: Mode, sessionId: string): string {
  return mode === "solo"
    ? `/session/${sessionId}/capture`
    : `/session/${sessionId}/waiting`;
}

const INSTRUCTIONS = [
  {
    title: "Shooting solo",
    description:
      "Skip the wait — jump straight into a synced countdown and capture your own 3-photo strip.",
  },
  {
    title: "Inviting others",
    description:
      "Get a shareable link and a waiting room where you'll see everyone connect before the countdown starts.",
  },
];

export default function ModeSelectClient() {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(mode: Mode) {
    setError(null);
    setPendingMode(mode);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          errorBody?.error ?? "Couldn't start a session. Please try again."
        );
      }

      const created = (await response.json()) as CreateSessionResponse;

      // Hand off the host identity /api/sessions already created — stored
      // here (before navigating) for BOTH modes:
      // - Solo never visits the waiting room, so this is the only chance to
      //   hand it off; /capture finds it via loadStoredParticipant and never
      //   needs its own fallback /join call, which used to create a second,
      //   disconnected participant row for the same solo player (QA finding,
      //   2026-08-06).
      // - Invite's host still goes through the waiting room's name-entry
      //   form like every other participant (they get to pick their own
      //   display name there), but WaitingClient now submits this stored
      //   participantId with that form so /join RENAMES this existing row
      //   instead of creating a second, disconnected one — the same class of
      //   bug, just on the invite path (found while re-testing the "not
      //   covered this pass" multiplayer path, 2026-08-06).
      saveStoredParticipant(created.id, {
        participantId: created.participant.id,
        displayName: created.participant.display_name,
        realtimeToken: created.realtimeToken,
      });

      router.push(nextPathFor(mode, created.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setPendingMode(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center gap-6 px-4 py-12">
      <ThemeSelector />

      <BoothFrame
        pose="setup"
        leftInstructions={INSTRUCTIONS.map((item) => item.title)}
        rightLabel="ENTER"
        rightSublabel="Step into the booth"
      >
        <Card className="flex w-[min(92vw,420px)] flex-col items-center gap-8 p-6 sm:p-8">
          <div className="animate-fade-up text-center">
            <p className="font-display text-sm italic text-rust-body">Step one</p>
            <h1 className="mt-2 font-display text-3xl italic text-ink">
              Choose how you&apos;re shooting
            </h1>
          </div>

          <NumberedList items={INSTRUCTIONS} className="w-full" />

          {error ? (
            <div role="alert">
              <Badge variant="warning">{error}</Badge>
            </div>
          ) : null}

          <div className="flex w-full flex-col gap-4 sm:flex-row">
            <Button
              variant="default"
              className="flex flex-1 flex-col items-center gap-2 py-6 text-base"
              onClick={() => handleSelect("solo")}
              disabled={pendingMode !== null}
              aria-busy={pendingMode === "solo"}
            >
              <UserIcon />
              {pendingMode === "solo" ? "Starting…" : "Shoot solo"}
            </Button>
            <Button
              variant="default"
              className="flex flex-1 flex-col items-center gap-2 py-6 text-base"
              onClick={() => handleSelect("invite")}
              disabled={pendingMode !== null}
              aria-busy={pendingMode === "invite"}
            >
              <UsersIcon />
              {pendingMode === "invite" ? "Starting…" : "Invite others"}
            </Button>
          </div>
        </Card>
      </BoothFrame>
    </main>
  );
}
