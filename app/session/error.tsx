"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Card from "@/components/ui/Card";
import Button, { CtaLink } from "@/components/ui/Button";

/**
 * Route-level error boundary for the whole session flow — covers
 * /session/new and every /session/[id]/* screen (waiting, capture, preview,
 * style, generate, output), since a Next.js error.tsx applies to its segment
 * and everything nested under it. Distinct from app/global-error.tsx, which
 * only catches crashes above the root layout and can't reach here — this
 * file renders inside RootLayout, so the real fonts/tokens are available.
 */
export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No-ops when Sentry was never initialised (empty DSN).
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <Card className="animate-fade-up p-8">
        <p className="font-display text-sm text-rust-body">Out of order</p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          The booth jammed
        </h1>
        <p className="mt-3 font-sans text-sm text-ink-secondary">
          Something broke while loading this screen. Your session is still
          there — try again, or head back to the start.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="default" onClick={() => reset()}>
            Try again
          </Button>
          <CtaLink href="/">Back to start</CtaLink>
        </div>
      </Card>
    </main>
  );
}
