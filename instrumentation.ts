import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook (current, 2026 @sentry/nextjs convention —
 * supersedes the older `sentry.client.config.ts`/`sentry.server.config.ts`/
 * `sentry.edge.config.ts`-trio-with-implicit-loading pattern). Next.js calls
 * `register()` once per runtime at boot, before any route/handler code
 * runs, so this is the single place that decides which server-side Sentry
 * config to load based on which runtime is booting.
 *
 * Client-side init lives in instrumentation-client.ts (a separate,
 * client-bundle-loaded file — Next.js's replacement name for the old
 * `sentry.client.config.ts`), not here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Captures errors thrown from Server Components, Route Handlers, and
 * Middleware automatically — this is Next.js's dedicated request-error hook,
 * distinct from (and in addition to) the manual, tagged captures added for
 * the three specific events ops-runbook.md §7 names (countdown drift,
 * camera permission denials, cron failures). Safe to export unconditionally:
 * `Sentry.captureRequestError` is a no-op when no Sentry client has been
 * initialized (i.e. `SENTRY_DSN` unset — see sentry.server.config.ts /
 * sentry.edge.config.ts's guards), so this never throws on its own.
 */
export const onRequestError = Sentry.captureRequestError;
