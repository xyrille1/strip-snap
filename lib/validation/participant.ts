import { z } from "zod";

/** Matches the DB check constraint `char_length(display_name) between 1 and 40`. */
export const joinSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  /**
   * Present when the caller already has a stored identity for this session
   * (e.g. the session creator's own `Host` row, minted by `POST
   * /api/sessions` and handed to the client before it ever reaches
   * `/join` — see `ModeSelectClient`'s doc comment). When set, `/join`
   * renames that existing anonymous row in place instead of inserting a
   * second, disconnected one for the same physical person. Optional and
   * ignored for a genuinely first-time joiner, who has no prior identity to
   * reference.
   */
  participantId: z.string().uuid().optional(),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;

export const participantStatusSchema = z.object({
  status: z.enum(["connected", "ready", "captured", "dropped"]),
});

export type ParticipantStatusInput = z.infer<typeof participantStatusSchema>;
