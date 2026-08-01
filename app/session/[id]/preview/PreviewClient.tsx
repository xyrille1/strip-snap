"use client";

export interface PreviewClientProps {
  sessionId: string;
}

// Retake-individual-shots UI over in-memory shots lands in Step 4 Item 6.
export default function PreviewClient({ sessionId }: PreviewClientProps) {
  return (
    <main>
      <h1>Preview — session {sessionId}</h1>
      <p>Shot preview and retake placeholder.</p>
    </main>
  );
}
