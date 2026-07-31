"use client";

export interface PresenceParticipant {
  id: string;
  displayName: string;
  status: "connected" | "ready" | "captured" | "dropped";
}

export interface PresenceListProps {
  participants: PresenceParticipant[];
}

// Real live subscription via lib/realtime.ts#subscribeToPresence lands in Step 4 Item 4.
export default function PresenceList({ participants }: PresenceListProps) {
  return (
    <ul>
      {participants.map((participant) => (
        <li key={participant.id}>{participant.displayName}</li>
      ))}
    </ul>
  );
}
