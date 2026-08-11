"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import OutputActions from "@/components/booth/OutputActions";
import Photostrip from "@/components/booth3d/Photostrip";
import { loadGeneratedStripId, saveGeneratedStripId } from "@/lib/stripStorage";

// Fabric.js (the editor's canvas/drawing dependency) never loads on the
// initial Output page view — only once "Edit strip" is actually clicked.
const StripEditor = dynamic(() => import("@/components/booth/StripEditor"), {
  ssr: false,
});

export interface OutputClientProps {
  sessionId: string;
}

interface StripResponse {
  id: string;
  sessionId: string;
  stylePreset: string;
  signedUrl: string;
  createdAt: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "no-handoff" }
  | { status: "error"; message: string }
  | { status: "ready"; strip: StripResponse };

/**
 * In-session finished-strip hero — the "signature moment" per design brief
 * §3 ("Output / share"): "full strip displayed large, centered... the most
 * whitespace on the whole site." Reads the strip id GenerateClient handed
 * off via lib/stripStorage.ts, then fetches GET /api/strips/:id (Phase 9 —
 * mints a fresh signed URL every call).
 */
export default function OutputClient({ sessionId }: OutputClientProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    const stripId = loadGeneratedStripId(sessionId);
    if (!stripId) {
      setState({ status: "no-handoff" });
      return;
    }

    let cancelled = false;
    void fetch(`/api/strips/${stripId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your strip.");
        const strip = (await response.json()) as StripResponse;
        if (cancelled) return;
        setState({ status: "ready", strip });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load your strip.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.status === "loading") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="font-sans text-sm text-ink-secondary">Loading your strip…</p>
      </main>
    );
  }

  if (state.status === "no-handoff" || state.status === "error") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <Badge variant="warning">
          {state.status === "error" ? state.message : "We couldn't find a strip for this session."}
        </Badge>
        <Button variant="default" onClick={() => router.push(`/session/${sessionId}/generate`)}>
          Back to generate
        </Button>
      </main>
    );
  }

  const { strip } = state;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center gap-5 px-4 py-8">
      <div className="animate-fade-up text-center print:hidden">
        <p className="font-display text-sm text-rust-body">Your strip</p>
        <h1 className="mt-2 font-display text-5xl text-ink">Ready</h1>
      </div>

      <div className="animate-fade-up">
        <Photostrip src={strip.signedUrl} alt="Your finished photo strip" />
      </div>

      <Button variant="default" onClick={() => setEditorOpen(true)} className="print:hidden">
        Edit strip
      </Button>

      <OutputActions stripId={strip.id} />

      {editorOpen ? (
        <StripEditor
          sessionId={sessionId}
          stripId={strip.id}
          stylePreset={strip.stylePreset}
          onCancel={() => setEditorOpen(false)}
          onSaved={(newStrip) => {
            setState({ status: "ready", strip: newStrip });
            saveGeneratedStripId(sessionId, newStrip.id);
            setEditorOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}
