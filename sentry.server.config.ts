import * as Sentry from "@sentry/nextjs";

/**
 * Server-runtime (Node.js) Sentry init, loaded by instrumentation.ts's
 * register() when `NEXT_RUNTIME === "nodejs"` — current (2026) @sentry/nextjs
 * convention, replacing the older `sentry.server.config.ts`-via-implicit-load
 * pattern with an explicit instrumentation.ts import.
 *
 * Deliberate fail-open guard, matching lib/rateLimit.ts's graceful-
 * degradation pattern: `SENTRY_DSN` is empty in `.env.local` (no Sentry
 * account provisioned yet for this project — see
 * docs/online-photobooth-implementation-plan.md Phase 15). Sentry.init()
 * itself would not throw on an empty dsn (it just silently disables the
 * SDK), but this guard makes that explicit and logs a single, clear warning
 * instead of staying silent — do not remove this guard or make it throw;
 * that would take down every server route any time Sentry isn't configured,
 * exactly the failure mode `dev.md`/Phase 14's Clerk-build lesson warns
 * against.
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
    "[sentry] SENTRY_DSN is not set — server-side error tracking is disabled until a Sentry project is provisioned."
  );
}
