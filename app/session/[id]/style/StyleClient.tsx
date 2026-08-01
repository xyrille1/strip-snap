"use client";

export interface StyleClientProps {
  sessionId: string;
}

// Style preset picker + compositor preview (lib/compositor.ts) lands in Step 4 Item 7.
export default function StyleClient({ sessionId }: StyleClientProps) {
  return (
    <main>
      <h1>Choose a style — session {sessionId}</h1>
      <p>Style preset picker placeholder.</p>
    </main>
  );
}
