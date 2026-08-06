import OutputClient from "./OutputClient";

interface OutputPageProps {
  params: { id: string };
}

// Server shell only — the in-session hero moment needs client-side state
// (sessionStorage hand-off from /generate, GET /api/strips/:id), which
// lives in OutputClient. Mirrors the same split used by every other
// app/session/[id]/*/page.tsx screen.
export default function OutputPage({ params }: OutputPageProps) {
  return <OutputClient sessionId={params.id} />;
}
