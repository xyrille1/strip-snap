"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { trackPresence } from "@/lib/realtime";

export interface ReadyToggleProps {
  sessionId: string;
  participantId: string;
  displayName: string;
  isReady: boolean;
  /** Called immediately (optimistic) with the new value once a click is handled. */
  onToggle: (isReady: boolean) => void;
}

/**
 * Illuminated forest-green select/confirm motif (design brief §4). Clicking
 * tracks the participant's updated status ("ready" / "connected") on the
 * session's Realtime presence channel — per this phase's design decision,
 * `participants.status` transitions live in ephemeral presence only, not a
 * DB write (see WaitingClient's top-of-file note for the full rationale).
 */
export default function ReadyToggle({
  sessionId,
  participantId,
  displayName,
  isReady,
  onToggle,
}: ReadyToggleProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const next = !isReady;
    setPending(true);
    onToggle(next);
    try {
      await trackPresence(sessionId, {
        participantId,
        displayName,
        status: next ? "ready" : "connected",
      });
    } catch (err) {
      console.error("[ReadyToggle] failed to update presence status", err);
      onToggle(!next); // roll back the optimistic update
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="illuminated"
        color="forest"
        active={isReady}
        onClick={handleClick}
        disabled={pending}
        aria-pressed={isReady}
      >
        <span className="sr-only">
          {isReady ? "Ready — tap to mark not ready" : "Tap when you're ready"}
        </span>
      </Button>
      <span className="font-sans text-sm font-medium text-ink" aria-hidden="true">
        {isReady ? "You're ready" : "Tap when ready"}
      </span>
    </div>
  );
}
