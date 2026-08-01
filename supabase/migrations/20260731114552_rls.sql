-- Row-Level Security: enable on every table, zero policies added.
-- Source of truth: docs/online-photobooth-backend-schema.md §4
--
-- An RLS-enabled table with zero policies denies all access to anon/authenticated roles by
-- default, which is the intended state — the service role (used only server-side in API routes)
-- bypasses RLS entirely and is the sole read/write path. Do not add any policies here.

alter table app_users        enable row level security;
alter table sessions         enable row level security;
alter table participants     enable row level security;
alter table strips           enable row level security;
alter table analytics_events enable row level security;
alter table daily_metrics    enable row level security;
