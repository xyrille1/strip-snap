import type { StripFormat } from "@/lib/compositor";
import type { Database } from "@/lib/supabase/types";

export type SessionStatus = Database["public"]["Enums"]["session_status"];

export interface SessionSummary {
  format: StripFormat;
  status: SessionStatus;
  participantCount: number;
}

/**
 * Classified outcome of `GET /api/sessions/:id`, shared by every client
 * screen that only needs a light summary (format/status/participant count)
 * rather than the full session+participants payload WaitingClient renders.
 *
 * "not-found" and "expired" are surfaced as distinct kinds so callers can
 * render `components/booth/SessionExpired.tsx` for either — a 404 is what
 * `getSessionById` returns once the expire-sessions cron hard-deletes the
 * row (Phase 12), and `status: "expired"` is the short window before that
 * hard delete where the row still exists but is marked expired. Both are
 * "this session is gone, start over" from the user's perspective.
 */
export type SessionFetchOutcome =
  | { kind: "ok"; summary: SessionSummary }
  | { kind: "expired" }
  | { kind: "not-found" }
  | { kind: "error" };

export async function fetchSessionSummary(sessionId: string): Promise<SessionFetchOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/sessions/${sessionId}`);
  } catch {
    return { kind: "error" };
  }

  if (response.status === 404) return { kind: "not-found" };
  if (!response.ok) return { kind: "error" };

  const body = (await response.json().catch(() => null)) as {
    session: { format: StripFormat; status: SessionStatus };
    participants: unknown[];
  } | null;
  if (!body) return { kind: "error" };

  if (body.session.status === "expired") return { kind: "expired" };

  return {
    kind: "ok",
    summary: {
      format: body.session.format,
      status: body.session.status,
      participantCount: body.participants.length,
    },
  };
}
