"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export interface OutputActionsProps {
  /** Strip id (backend-schema §3.4) — used to mint fresh signed URLs on demand and to build the public `/strip/:id` share link. */
  stripId: string;
}

interface StripSignedUrlResponse {
  signedUrl: string;
}

/**
 * Signed URLs are short-lived (backend-schema §5, 5-15 min). Rather than
 * trusting whatever URL the page happened to fetch on mount, every action
 * that needs the actual image bytes (download, file-share) re-fetches
 * `GET /api/strips/:id` right before use — that route mints a fresh signed
 * URL on every call (Phase 9), so this works no matter how long the visitor
 * lingered on the page first.
 */
async function fetchFreshSignedUrl(stripId: string): Promise<string> {
  const response = await fetch(`/api/strips/${stripId}`);
  if (!response.ok) throw new Error("Could not refresh the strip image link.");
  const body = (await response.json()) as StripSignedUrlResponse;
  return body.signedUrl;
}

function fileNameFor(stripId: string): string {
  return `strip-snap-${stripId}.png`;
}

function publicShareUrl(stripId: string): string {
  if (typeof window === "undefined") return `/strip/${stripId}`;
  return `${window.location.origin}/strip/${stripId}`;
}

/**
 * Real download / native-share / self-print / restart wiring (Phase 10).
 * All four actions are equal-weight outlined pills per design brief §3
 * ("no button hierarchy here, all four are equally valid next steps").
 */
export default function OutputActions({ stripId }: OutputActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  async function handleDownload() {
    setBusy("download");
    setStatus(null);
    try {
      const freshUrl = await fetchFreshSignedUrl(stripId);
      const blobResponse = await fetch(freshUrl);
      if (!blobResponse.ok) throw new Error("Could not download the strip image.");
      const blob = await blobResponse.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileNameFor(stripId);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Download failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    setBusy("share");
    setStatus(null);
    const shareUrl = publicShareUrl(stripId);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        // Prefer sharing the actual image file (Web Share API Level 2) when
        // the platform supports it — falls back to link-only sharing below,
        // which still hands the OS share sheet the public `/strip/:id` link
        // (F-27/F-28) rather than a raw, expiring Storage URL.
        if (typeof navigator.canShare === "function") {
          try {
            const freshUrl = await fetchFreshSignedUrl(stripId);
            const blobResponse = await fetch(freshUrl);
            const blob = await blobResponse.blob();
            const file = new File([blob], fileNameFor(stripId), {
              type: blob.type || "image/png",
            });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "My Strip Snap photo strip",
                text: "Check out my photo strip!",
              });
              return;
            }
          } catch {
            // Fall through to link-only share below.
          }
        }
        await navigator.share({
          title: "My Strip Snap photo strip",
          text: "Check out my photo strip!",
          url: shareUrl,
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setStatus("Link copied to clipboard.");
        return;
      }

      setStatus(shareUrl);
    } catch (err) {
      // AbortError = the visitor cancelled the native share sheet — not a failure.
      if (err instanceof Error && err.name === "AbortError") return;
      setStatus(err instanceof Error ? err.message : "Could not share. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    // Self-print only per PRD scope (not mail-out fulfillment) — the
    // simpler of the two allowed MVP options. A print stylesheet
    // (`print:hidden` on every non-strip element, applied by the pages that
    // render this component) plus `window.print()` needs no extra network
    // round-trip or file generation: the already-rendered, already-loaded
    // strip `<img>` on the page IS the print-ready output. A separate
    // "downloadable print-ready file" would just re-serve the identical PNG
    // through a second code path, so it's skipped as redundant rather than
    // actually simpler.
    window.print();
  }

  return (
    <div className="w-full">
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <Button variant="default" onClick={handleDownload} disabled={busy === "download"}>
          {busy === "download" ? "Downloading…" : "Download"}
        </Button>
        <Button variant="default" onClick={handleShare} disabled={busy === "share"}>
          {busy === "share" ? "Sharing…" : "Share"}
        </Button>
        <Button variant="default" onClick={handlePrint}>
          Print
        </Button>
        <Button variant="default" onClick={() => router.push("/")}>
          Start over
        </Button>
      </div>
      {status ? (
        <p
          className="mt-3 text-center font-sans text-xs text-ink-secondary print:hidden"
          role="status"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
