-- Explicit table-level GRANTs for the service_role Postgres access path.
-- Source of truth: docs/online-photobooth-backend-schema.md §1 design principle 1 — "the service
-- role (used only server-side in API routes) bypasses RLS entirely and is the sole read/write
-- path" for every application table — and §4, which enables RLS with zero policies on each of
-- these tables.
--
-- RLS bypass (the `rolbypassrls` attribute already set on `service_role`) and table-level
-- GRANT/REVOKE are two independent Postgres mechanisms. Enabling RLS with zero policies
-- (20260731114552_rls.sql) correctly denies `anon`/`authenticated` direct access, but it does not
-- grant `service_role` anything either — without an explicit GRANT, service_role gets "permission
-- denied" on every read/write against these tables, regardless of its RLS-bypass attribute. None
-- of the preceding migrations ever issued one.
--
-- This is a pure privilege grant — no table DDL, no column/constraint changes, no RLS policy
-- changes on any application table. It does not touch realtime.messages (governed separately by
-- 20260801172541_realtime_authorization.sql).

grant select, insert, update, delete on
  app_users,
  sessions,
  participants,
  strips,
  analytics_events,
  daily_metrics
to service_role;
