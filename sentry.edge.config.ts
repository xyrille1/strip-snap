import * as Sentry from "@sentry/nextjs";

/**
 * Edge-runtime Sentry init, loaded by instrumentation.ts's register() when
 * `NEXT_RUNTIME === "edge"` (e.g. middleware.ts running on the Edge
 * runtime). Same fail-open guard as sentry.server.config.ts — see that
 * file's doc comment for why this must never throw when `SENTRY_DSN` is
 * unset.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // No performance tracing needed for MVP scope (mvp-scope.md §4) — error
    // capture only.
    tracesSampleRate: 0,
  });
} else {
  console.warn(
    "[sentry] SENTRY_DSN is not set — edge-runtime error tracking is disabled until a Sentry project is provisioned."
  );
}
