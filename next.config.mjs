import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Re-exposes SENTRY_DSN (server-side-only by default) into the client
  // bundle under its own name, so instrumentation-client.ts can read the
  // same var name the server/edge configs use instead of requiring a
  // duplicate NEXT_PUBLIC_SENTRY_DSN (a DSN is a write-only ingest
  // identifier, safe to ship client-side — see instrumentation-client.ts's
  // doc comment).
  env: {
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
  // The machine running this dev server is memory-constrained. Webpack's
  // persistent filesystem cache (.next/cache) grows unbounded and gzip-
  // serializes itself on every compile, which was crashing the dev server
  // with "Array buffer allocation failed" / OOM once the cache passed
  // ~800MB. Disabling it in dev trades slower rebuilds for a dev server
  // that doesn't crash; production builds are unaffected.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
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
