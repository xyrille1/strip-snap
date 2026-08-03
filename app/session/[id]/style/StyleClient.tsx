"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StylePicker from "@/components/booth/StylePicker";
import StripPreview from "@/components/booth/StripPreview";
import SessionExpired from "@/components/booth/SessionExpired";
import { STYLE_PRESETS } from "@/lib/validation/strip";
import type { StripFormat, StylePreset } from "@/lib/compositor";
import { loadSessionShots, type SessionShotsMap } from "@/lib/sessionShotsStorage";
import { loadSelectedStyle, saveSelectedStyle } from "@/lib/styleStorage";
import { fetchSessionSummary } from "@/lib/booth/sessionSummary";

export interface StyleClientProps {
  sessionId: string;
}

const DEFAULT_FORMAT: StripFormat = "3";

export default function StyleClient({ sessionId }: StyleClientProps) {
  const router = useRouter();
  const [shotsByParticipant, setShotsByParticipant] = useState<SessionShotsMap>({});
  const [format, setFormat] = useState<StripFormat>(DEFAULT_FORMAT);
  const [participantCount, setParticipantCount] = useState<number | undefined>(undefined);
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>(STYLE_PRESETS[0]);
  const [hydrated, setHydrated] = useState(false);
  const [expired, setExpired] = useState(false);

  // 1. Hydrate the session-wide shot map (lib/sessionShotsStorage.ts) — the
  // hand-off CaptureClient/PreviewClient wrote — plus any previously chosen
  // preset (e.g. this participant navigated back from /generate).
  useEffect(() => {
    const map = loadSessionShots(sessionId) ?? {};
    setShotsByParticipant(map);

    const storedPreset = loadSelectedStyle(sessionId);
    if (storedPreset) setSelectedPreset(storedPreset);

    setHydrated(true);
  }, [sessionId]);

  // 2. Fetch this session's format + participant count (Phase 5's
  // GET /api/sessions/:id) so the layout/grid reflects the real invited
  // group size, not just however many participants happen to have a shot
  // map entry already (see StripPreview's participantCount prop doc
  // comment). Non-fatal on failure — the preview still renders using the
  // shot map's own key count as a fallback.
  useEffect(() => {
    let cancelled = false;
    void fetchSessionSummary(sessionId).then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "expired" || outcome.kind === "not-found") {
        setExpired(true);
        return;
      }
      // "error" (network/unexpected failure) stays non-fatal here, same as
      // before this helper existed — the preview still renders using the
      // shot map's own key count as a fallback.
      if (outcome.kind !== "ok") return;
      setFormat(outcome.summary.format);
      setParticipantCount(outcome.summary.participantCount);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Switching presets updates the preview each time (F-19) — this handler is
  // the only place selectedPreset changes, and StripPreview's draw effect is
  // keyed on stylePreset, so every selection triggers a fresh full redraw
  // (see StripPreview's doc comment for why that rules out stale bleed).
  const handleSelect = useCallback(
    (preset: StylePreset) => {
      setSelectedPreset(preset);
      saveSelectedStyle(sessionId, preset);
    },
    [sessionId]
  );

  const goToGenerate = useCallback(() => {
    saveSelectedStyle(sessionId, selectedPreset);
    router.push(`/session/${sessionId}/generate`);
  }, [router, sessionId, selectedPreset]);

  const hasAnyShot = Object.values(shotsByParticipant).some((shots) =>
    shots.some((shot) => shot !== null)
  );

  if (expired) {
    return <SessionExpired sessionId={sessionId} />;
  }

  if (hydrated && !hasAnyShot) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <Badge variant="warning">No shots found for this session yet.</Badge>
        <p className="font-sans text-sm text-ink-secondary">
          Head back to the booth to capture your shots first.
        </p>
        <Button variant="default" onClick={() => router.push(`/session/${sessionId}/capture`)}>
          Back to capture
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center gap-8 px-4 py-16">
      <div className="text-center">
        <p className="font-display text-sm italic text-rust-body">Style</p>
        <h1 className="mt-2 font-display text-4xl italic text-ink">Pick a look</h1>
        <p className="mt-2 font-sans text-sm text-ink-secondary">
          Preview updates instantly — nothing is final until you continue.
        </p>
      </div>

      <div className="grid w-full gap-8 sm:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 font-sans text-sm font-semibold text-ink">Preview</p>
          <StripPreview
            format={format}
            stylePreset={selectedPreset}
            shotsByParticipant={shotsByParticipant}
            participantCount={participantCount}
          />
        </Card>

        <Card className="p-4">
          <p className="mb-3 font-sans text-sm font-semibold text-ink">Choose a style</p>
          <StylePicker selected={selectedPreset} onSelect={handleSelect} />
        </Card>
      </div>

      <Button
        variant="default"
        onClick={goToGenerate}
        className="border-forest bg-forest text-cream hover:bg-forest/90"
      >
        Continue to generate →
      </Button>
    </main>
  );
}
