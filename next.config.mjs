import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Landing-page filmstrip placeholder imagery only (no real strips
      // exist yet — docs/online-photobooth-implementation-plan.md Phase 3).
      // Swap/remove once real strip thumbnails are available.
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Re-exposes SENTRY_DSN (server-side-only by default) into the client
  // bundle under its own name, so instrumentation-client.ts can read the
  // same var name the server/edge configs use instead of requiring a
  // duplicate NEXT_PUBLIC_SENTRY_DSN (a DSN is a write-only ingest
  // identifier, safe to ship client-side — see instrumentation-client.ts's
  // doc comment).
  env: {
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
};

// withSentryConfig no-ops its source-map-upload plugin cleanly when
// org/project/authToken aren't configured (none exist yet — no Sentry
// account provisioned, per docs/online-photobooth-implementation-plan.md
// Phase 15) — it does not hard-fail `next build` the way an empty required
// Clerk env var did in Phase 14. Verified locally with all three SENTRY_*
// vars unset before relying on this in CI.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
