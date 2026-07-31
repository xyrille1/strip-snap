-- Source of truth: docs/online-photobooth-backend-schema.md §3.2
-- host_user_id uses `on delete set null` rather than cascade — deleting a user account shouldn't
-- erase a session other participants are actively using; it just orphans the host reference.

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  host_user_id    uuid references app_users(id) on delete set null,  -- null if host never logged in
  mode            session_mode not null,
  format          session_format not null default '3',
  status          session_status not null default 'waiting',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  completed_at    timestamptz
);

create index idx_sessions_status_expires on sessions (status, expires_at);   -- cleanup job scan
create index idx_sessions_host_user_id on sessions (host_user_id) where host_user_id is not null;
