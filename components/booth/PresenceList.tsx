"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { subscribeToPresence, type ParticipantStatus } from "@/lib/realtime";

export interface PresenceParticipant {
  id: string;
  displayName: string;
  status: ParticipantStatus;
}

export interface PresenceListProps {
  sessionId: string;
  /**
   * Optional initial snapshot (e.g. from `GET /api/sessions/:id`) rendered
   * until the live presence sync arrives, so the room isn't empty for the
   * split second before the Realtime channel joins.
   */
  participants?: PresenceParticipant[];
}

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  connected: "Connected",
  ready: "Ready",
  captured: "Captured",
  dropped: "Dropped",
};

const STATUS_BADGE_VARIANT: Record<ParticipantStatus, "default" | "success" | "warning"> = {
  connected: "default",
  ready: "success",
  captured: "default",
  dropped: "warning",
};

/**
 * Simple rows, not avatars-in-bubbles — keep it editorial, not app-generic
 * (design brief §3, "Mode select / waiting room"). Self-subscribes to
 * `lib/realtime.ts#subscribeToPresence` so it updates live as participants
 * join, leave, or change ready status; falls back to the `participants` prop
 * (a DB snapshot) only until that first live sync arrives.
 */
export default function PresenceList({ sessionId, participants = [] }: PresenceListProps) {
  const [live, setLive] = useState<PresenceParticipant[] | null>(null);

  useEffect(() => {
    setLive(null);
    const unsubscribe = subscribeToPresence(sessionId, (states) => {
      setLive(
        states.map((state) => ({
          id: state.participantId,
          displayName: state.displayName,
          status: state.status,
        }))
      );
    });
    return unsubscribe;
  }, [sessionId]);

  const rows = live ?? participants;

  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <p className="font-sans text-sm text-ink-secondary">
          Waiting for participants to join…
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-structural-gray">
        {rows.map((participant) => (
          <li
            key={participant.id}
            className="flex items-center justify-between gap-4 px-6 py-4"
          >
            <span className="font-sans text-sm font-medium text-ink">
              {participant.displayName}
            </span>
            <Badge variant={STATUS_BADGE_VARIANT[participant.status]}>
              {STATUS_LABEL[participant.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
