import { z } from "zod";

/** Matches the DB check constraint `char_length(display_name) between 1 and 40`. */
export const joinSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;

export const participantStatusSchema = z.object({
  status: z.enum(["connected", "ready", "captured", "dropped"]),
});

export type ParticipantStatusInput = z.infer<typeof participantStatusSchema>;
