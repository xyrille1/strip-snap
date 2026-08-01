-- Source of truth: docs/online-photobooth-backend-schema.md §3.3
-- display_name is deliberately freeform and capped at 40 chars (not tied to real identity) —
-- matches the PRD's minimal-PII posture. The composite unique constraint stops a logged-in user
-- from occupying two waiting-room slots; anonymous participants (user_id is null) are exempt
-- since Postgres treats null as distinct in unique constraints, which is correct here (multiple
-- anonymous joiners are expected).

create table participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  user_id        uuid references app_users(id) on delete set null,  -- null for anonymous
  display_name   text not null check (char_length(display_name) between 1 and 40),
  status         participant_status not null default 'connected',
  joined_at      timestamptz not null default now(),

  unique (session_id, user_id)   -- a logged-in user can't double-join the same session
);

create index idx_participants_session_id on participants (session_id);
