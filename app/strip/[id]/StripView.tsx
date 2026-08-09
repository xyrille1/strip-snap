"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import OutputActions from "@/components/booth/OutputActions";
import StickerOverlay from "@/components/booth/StickerOverlay";

export interface StripViewProps {
  stripId: string;
  signedUrl: string;
}

/**
 * Client half of the public share view (app/strip/[id]/page.tsx) — owns the
 * only interactive bits (sticker toggle, download/share/print buttons).
 * Deliberately has no "back to booth" or other participant-only action:
 * whoever lands here may never have joined the original session at all
 * (F-28), so there's no session context to navigate back into. "Start
 * over" (inside OutputActions) still links to the public landing page,
 * which is fine for a visitor who never joined too.
 */
export default function StripView({ stripId, signedUrl }: StripViewProps) {
  const [stickersVisible, setStickersVisible] = useState(false);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center gap-10 px-4 py-20">
      <div className="animate-fade-up text-center print:hidden">
        <p className="font-display text-sm italic text-rust-body">Strip Snap</p>
        <h1 className="mt-2 font-display text-5xl italic text-ink">A shared strip</h1>
        <p className="mt-3 font-sans text-sm text-ink-secondary">
          No account or invite needed — this link is all it takes.
        </p>
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static/optimizable asset. */}
        <img
          src={signedUrl}
          alt="A shared photo strip"
          className="mx-auto block w-full rounded-card-lg border border-hairline border-structural-gray bg-film-black p-2"
        />
        <StickerOverlay visible={stickersVisible} />
      </div>

      <Button
        variant="default"
        aria-pressed={stickersVisible}
        onClick={() => setStickersVisible((v) => !v)}
        className="print:hidden"
      >
        {stickersVisible ? "Hide stickers" : "Add stickers"}
      </Button>

      <OutputActions stripId={stripId} />
    </main>
  );
}
