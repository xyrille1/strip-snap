"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import NumberedList from "@/components/ui/NumberedList";

type Mode = "solo" | "invite";

interface CreateSessionResponse {
  id: string;
  join_url: string;
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
      router.push(nextPathFor(mode, created.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setPendingMode(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col justify-center gap-8 px-4 py-16">
      <div>
        <p className="font-display text-sm italic text-rust-body">Step one</p>
        <h1 className="mt-2 font-display text-4xl italic text-ink">
          Choose how you&apos;re shooting
        </h1>
      </div>

      <Card className="p-6 sm:p-8">
        <NumberedList items={INSTRUCTIONS} />
      </Card>

      {error ? (
        <div role="alert">
          <Badge variant="warning">{error}</Badge>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row">
        <Button
          variant="default"
          className="flex-1 py-4 text-base"
          onClick={() => handleSelect("solo")}
          disabled={pendingMode !== null}
          aria-busy={pendingMode === "solo"}
        >
          {pendingMode === "solo" ? "Starting…" : "Shoot solo"}
        </Button>
        <Button
          variant="default"
          className="flex-1 py-4 text-base"
          onClick={() => handleSelect("invite")}
          disabled={pendingMode !== null}
          aria-busy={pendingMode === "invite"}
        >
          {pendingMode === "invite" ? "Starting…" : "Invite others"}
        </Button>
      </div>
    </main>
  );
}
