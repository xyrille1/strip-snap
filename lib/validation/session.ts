import { z } from "zod";

/**
 * Session creation deliberately does NOT accept a `format` field.
 *
 * If an unauthenticated client could set `format: '4'` at creation time, it
 * would bypass the login-gated upgrade path entirely (see
 * docs/online-photobooth-backend-schema.md — format only ever changes via a
 * separate authenticated upgrade endpoint elsewhere in the app). Keeping
 * `format` out of this schema means the DB default ('3') is always what a
 * freshly created session gets, no matter what a malicious payload tries to
 * smuggle in.
 */
export const createSessionSchema = z.object({
  mode: z.enum(["solo", "invite"]),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

/** Validates the `:id` route param shape on any `/api/sessions/:id...` route. */
export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type SessionIdParamInput = z.infer<typeof sessionIdParamSchema>;
