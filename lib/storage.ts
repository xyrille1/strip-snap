import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Matches the private bucket provisioned by supabase/migrations/20260731114548_storage_bucket.sql. */
const STRIPS_BUCKET = "strips";

/**
 * Uploads a finalized strip image to the private `strips` Storage bucket at
 * `path` (caller-constructed, e.g. `strips/{session_id}/{strip_id}.png` per
 * backend-schema §3.4). Server-side only — the bucket is private
 * (`public: false`), so this is the only write path; browsers never talk to
 * Storage directly for uploads.
 *
 * Content type is inferred from `path`'s extension (`.png` -> image/png,
 * `.jpg`/`.jpeg` -> image/jpeg) rather than requiring a separate parameter —
 * keeps the signature exactly `(path, data)` per the task brief while still
 * giving Storage a correct Content-Type for the object it serves back.
 */
export async function uploadStripImage(
  path: string,
  data: Buffer | Blob
): Promise<void> {
  const supabase = createServiceRoleClient();
  const contentType = path.endsWith(".jpg") || path.endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";

  const { error } = await supabase.storage
    .from(STRIPS_BUCKET)
    .upload(path, data, { contentType, upsert: false });

  if (error) throw new Error(error.message);
}

/**
 * Mints a fresh short-lived signed URL for `path`. Per backend-schema §5,
 * expiry should be 5-15 min (300-900s) — callers are expected to pass a
 * value in that range, not enforced here since the exact expiry is a
 * per-call policy decision (e.g. GET /api/strips/:id's "mint fresh every
 * call" contract), not a Storage-layer constraint.
 *
 * The bucket is private, so this is the ONLY way to read an object's
 * contents — never construct or return a raw public URL (there isn't one;
 * the bucket has no public-read policy).
 */
export async function mintSignedStripUrl(
  path: string,
  expirySeconds: number
): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(STRIPS_BUCKET)
    .createSignedUrl(path, expirySeconds);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/**
 * Deletes a strip image from Storage. Not yet called anywhere (the
 * expire-sessions cron that will call this is Phase 12) — implemented now,
 * alongside the other two Storage primitives, per the Phase 9 task brief.
 * Postgres's `on delete cascade` on `strips.session_id` never touches
 * Storage objects (backend-schema §7), so this must be called explicitly
 * before a session's row cascade runs.
 */
export async function deleteStripImage(path: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(STRIPS_BUCKET).remove([path]);

  if (error) throw new Error(error.message);
}
