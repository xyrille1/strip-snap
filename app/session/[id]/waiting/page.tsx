import WaitingClient from "./WaitingClient";

interface WaitingPageProps {
  params: { id: string };
}

// Server shell only — the waiting room needs client-side state (fetching
// GET /api/sessions/:id, POST /join, Realtime presence), which lives in
// WaitingClient. Mirrors the same split used by
// app/session/new/page.tsx + ModeSelectClient.
export default function WaitingPage({ params }: WaitingPageProps) {
  return <WaitingClient sessionId={params.id} />;
}
