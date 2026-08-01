"use client";

export interface GenerateClientProps {
  sessionId: string;
}

// Login-gate-for-4-photo prompt + strip generation/developing animation
// (compositor.ts, POST /api/strips) lands in Step 4 Item 8.
export default function GenerateClient({ sessionId }: GenerateClientProps) {
  return (
    <main>
      <h1>Generating your strip — session {sessionId}</h1>
      <p>Login gate and developing animation placeholder.</p>
    </main>
  );
}
