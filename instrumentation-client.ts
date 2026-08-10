import * as Sentry from "@sentry/nextjs";

/**
 * Client-bundle Sentry init (current, 2026 @sentry/nextjs convention — this
 * exact filename replaces the older `sentry.client.config.ts`; Next.js
 * loads it automatically as part of the client entry point, no manual
 * import needed anywhere).
 *
 * Reads the same `SENTRY_DSN` env var the server/edge configs use (rather
 * than a separate `NEXT_PUBLIC_SENTRY_DSN`) — next.config.mjs's `env` block
 * explicitly re-exposes it into the client bundle under its own name. A
 * Sentry DSN is a write-only ingest identifier, not a credential capable of
 * reading data back out (ops-runbook.md §2 notes it's "low risk" even
 * though it's listed as secret out of caution), so shipping it to the
 * client is safe and this avoids introducing a second, duplicate env var
 * for the same value.
 *
 * Deliberate fail-open guard, matching lib/rateLimit.ts's graceful-
 * degradation pattern: `SENTRY_DSN` is empty in `.env.local` (no Sentry
 * account provisioned yet — see
 * docs/online-photobooth-implementation-plan.md Phase 15). Do not remove
 * this guard or let Sentry.init() run unconditionally with an empty dsn —
 * this file loads on every single page in the client bundle, so a hard
 * failure here would break the entire app for every user.
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
    "[sentry] SENTRY_DSN is not set — client-side error tracking is disabled until a Sentry project is provisioned."
  );
}

/**
 * Router-navigation instrumentation hook. @sentry/nextjs looks for this
 * export by name on the client instrumentation file and warns loudly at
 * startup when it's missing; without it, App Router client-side navigations
 * aren't tied to the errors they produce, so a crash on /session/:id/style
 * reports with whatever route the user first landed on.
 *
 * Exported unconditionally, unlike the `Sentry.init()` above: it's just a
 * function reference, and `captureRouterTransitionStart` is a no-op when the
 * SDK was never initialised (the empty-DSN case this file already guards
 * for), so there's no init-order dependency to get wrong here.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
