import PreviewClient from "./PreviewClient";

interface PreviewPageProps {
  params: { id: string };
}

// Server shell only — real retake logic (Step 4 Item 6) lives in
// PreviewClient, which operates on in-memory (own + relayed) shots.
export default function PreviewPage({ params }: PreviewPageProps) {
  return <PreviewClient sessionId={params.id} />;
}
