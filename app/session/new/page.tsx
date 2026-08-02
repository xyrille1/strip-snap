import ModeSelectClient from "./ModeSelectClient";

// Server shell only — the mode-select buttons need client-side state (POST
// /api/sessions, router navigation), which lives in ModeSelectClient. Mirrors
// the same split used by app/session/[id]/capture/page.tsx + CaptureClient.
export default function NewSessionPage() {
  return <ModeSelectClient />;
}
