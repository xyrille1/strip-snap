-- Rollup table, not part of the live write path. Source of truth: docs/online-photobooth-backend-schema.md §3.6
-- Populated by a nightly scheduled job that aggregates analytics_events for the prior day.
-- Not FK'd to anything — independent of session/user lifecycle.

create table daily_metrics (
  day                  date primary key,
  sessions_started     integer not null default 0,
  strips_completed     integer not null default 0,
  unique_participants  integer not null default 0
);
