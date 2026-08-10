"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary for React rendering errors thrown above (or inside)
 * the root layout — the one class of crash a route-level `error.tsx` can't
 * catch, and which otherwise reaches the user as a blank white page with
 * nothing reported to Sentry.
 *
 * Next.js swaps this in *instead of* `app/layout.tsx`, so it has to render
 * its own `<html>`/`<body>`. That also means next/font's CSS variables
 * (set on the layout's `<body>`) aren't available here, so the sketch look
 * is expressed with literal values rather than the `font-display`/`bg-cream`
 * tokens that resolve through them — this file must render correctly even
 * when the thing that broke is the layout itself.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No-ops when Sentry was never initialised (empty DSN — see
    // instrumentation-client.ts), so this is safe in local dev too.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f5f6f8",
          color: "#2b2620",
          fontFamily: '"Space Grotesk", Helvetica, Arial, sans-serif',
        }}
      >
        <main
          style={{
            maxWidth: "420px",
            width: "100%",
            background: "#ffffff",
            border: "3px solid #000000",
            boxShadow: "6px 6px 0 0 rgba(0, 0, 0, 1)",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#8c3a1d",
              fontFamily: '"Segoe Print", "Bradley Hand", cursive',
            }}
          >
            Out of order
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: "30px",
              fontWeight: 400,
              fontFamily: '"Segoe Print", "Bradley Hand", cursive',
            }}
          >
            The booth jammed
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: "14px", color: "#6b6355" }}>
            Something broke while loading this screen. Your session is still
            there — try again, or head back to the start.
          </p>

          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                border: "3px solid #2b2620",
                borderRadius: "9999px",
                background: "transparent",
                color: "#2b2620",
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "3px solid #33422e",
                borderRadius: "9999px",
                background: "#33422e",
                color: "#f5f6f8",
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              Back to start
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
