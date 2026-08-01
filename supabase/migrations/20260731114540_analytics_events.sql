-- Source of truth: docs/online-photobooth-backend-schema.md §3.5
-- `on delete set null` on both FKs (not cascade) — a session or user disappearing shouldn't
-- erase the historical count that already happened; that would corrupt the "100 sessions in
-- 30 days" metric retroactively.

create table analytics_events (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references sessions(id) on delete set null,
  event          analytics_event_type not null,
  user_id        uuid references app_users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index idx_analytics_events_event_created on analytics_events (event, created_at);
create index idx_analytics_events_session_id on analytics_events (session_id);
