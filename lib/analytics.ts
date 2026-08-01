import "server-only";
import type { recordEvent } from "@/lib/db/analyticsEvents";

/**
 * Thin wrapper over lib/db/analyticsEvents.ts's `recordEvent`. API routes
 * should call this rather than importing lib/db directly, so tracking
 * failures can be observed/handled in one place once this is implemented.
 * Server-only, same as the module it wraps.
 */
export type TrackEventInput = Parameters<typeof recordEvent>[0];

export async function trackEvent(input: TrackEventInput): Promise<void> {
  void input;
  throw new Error("not implemented");
}
