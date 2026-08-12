"use client";

import OutputActions from "@/components/booth/OutputActions";
import Photostrip from "@/components/booth3d/Photostrip";

export interface StripViewProps {
  stripId: string;
  signedUrl: string;
}

/**
 * Client half of the public share view (app/strip/[id]/page.tsx) — owns the
 * only interactive bits (download/share/print buttons). Deliberately has no
 * "back to booth" or other participant-only action: whoever lands here may
 * never have joined the original session at all (F-28), so there's no
 * session context to navigate back into. "Start over" (inside
 * OutputActions) still links to the public landing page, which is fine for
 * a visitor who never joined too.
 *
 * Display-only by design — no strip editor here. This is the
 * public/unauthenticated share view; a visitor editing someone else's
 * shared strip isn't a fit, and this may already be viewing an edited
 * strip if that's the id that got shared. (The strip editor lives at
 * app/session/[id]/output/OutputClient.tsx instead.)
 */
export default function StripView({ stripId, signedUrl }: StripViewProps) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center gap-10 px-4 py-20">
      <div className="animate-fade-up text-center print:hidden">
        <p className="font-display text-sm text-rust-body">Strip Snap</p>
        <h1 className="mt-2 font-display text-5xl text-ink">A shared strip</h1>
        <p className="mt-3 font-sans text-sm text-ink-secondary">
          No account or invite needed — this link is all it takes.
        </p>
      </div>

      <div className="animate-fade-up">
        <Photostrip src={signedUrl} alt="A shared photo strip" />
      </div>

      <OutputActions stripId={stripId} />
    </main>
  );
}
