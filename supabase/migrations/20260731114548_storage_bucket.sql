-- Private Storage bucket for finalized strip images only.
-- Source of truth: docs/online-photobooth-backend-schema.md §5 —
-- "the bucket itself is private, not public-read"; access is via short-lived signed URLs
-- minted server-side by GET /api/strips/:id, never a raw public URL.

insert into storage.buckets (id, name, public)
values ('strips', 'strips', false)
on conflict (id) do nothing;
