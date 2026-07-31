-- Source of truth: docs/online-photobooth-backend-schema.md §3.4
-- storage_path (not a raw public URL): expired signed URLs can be re-issued on demand
-- (GET /api/strips/:id mints a fresh short-lived signed URL server-side) rather than the
-- database holding a URL that silently stops working.

create table strips (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  style_preset   text not null,
  storage_path   text not null,       -- Supabase Storage object path, not a raw public URL
  created_at     timestamptz not null default now()
);

create index idx_strips_session_id on strips (session_id);
