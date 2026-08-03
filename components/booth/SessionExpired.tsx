import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { CtaLink } from "@/components/ui/Button";

export interface SessionExpiredProps {
  sessionId: string;
}

/**
 * Shared expired/gone-session state, rendered by any screen whose
 * `GET /api/sessions/:id` fetch (via `lib/booth/sessionSummary.ts`, or an
 * equivalent 404 from `/join`) reports the session is no longer available —
 * either `status: "expired"` (marked but not yet hard-deleted) or an outright
 * 404 (the expire-sessions cron already swept it, backend-schema §7). Both
 * cases are indistinguishable to the user: the session is gone, and the only
 * next step is starting a new one. `sessionId` is shown only as a short
 * reference fragment (already visible in the URL bar; not sensitive) in case
 * someone reports the dead link for support.
 */
export default function SessionExpired({ sessionId }: SessionExpiredProps) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div>
        <p className="font-display text-sm italic text-rust-body">Session ended</p>
        <h1 className="mt-2 font-display text-4xl italic text-ink">
          This booth session has closed
        </h1>
      </div>

      <Card className="flex flex-col items-center gap-4 p-6 sm:p-8">
        <Badge variant="warning">Session expired</Badge>
        <p className="max-w-sm font-sans text-sm leading-relaxed text-ink-secondary">
          Sessions and their photos are automatically cleared a short while after they start, to
          keep everyone&apos;s shots private. This one — and anything captured in it — is no
          longer available.
        </p>
        <p className="font-sans text-xs text-ink-secondary/70">
          Reference: <span className="font-mono">{sessionId.slice(0, 8)}</span>
        </p>
      </Card>

      <CtaLink href="/session/new">Start a new session →</CtaLink>
    </main>
  );
}
