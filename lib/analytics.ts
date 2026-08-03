import "server-only";
import { recordEvent } from "@/lib/db/analyticsEvents";

/**
 * Thin wrapper over lib/db/analyticsEvents.ts's `recordEvent`. API routes
 * should call this rather than importing lib/db directly, so tracking
 * failures are observed/handled in one place. Server-only, same as the
 * module it wraps.
 *
 * Failure handling: swallows (catches + `console.error`'s) any error from
 * the underlying insert instead of propagating it. Analytics recording is a
 * secondary, best-effort concern here — a transient DB hiccup while writing
 * `session_started`/`strip_completed` must never turn an otherwise-successful
 * session creation or strip upload into a 500 for the user. Callers can rely
 * on `trackEvent` never rejecting.
 */
export type TrackEventInput = Parameters<typeof recordEvent>[0];

export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    await recordEvent(input);
  } catch (error) {
    console.error("trackEvent: failed to record analytics event", {
      event: input.event,
      sessionId: input.sessionId,
      error,
    });
  }
}
