"use client";

export interface CaptureClientProps {
  sessionId: string;
}

// Countdown sync (lib/realtime.ts) + getUserMedia capture lands in Step 4 Item 5.
export default function CaptureClient({ sessionId }: CaptureClientProps) {
  return (
    <main>
      <h1>Capture — session {sessionId}</h1>
      <p>Countdown and camera capture placeholder.</p>
    </main>
  );
}
