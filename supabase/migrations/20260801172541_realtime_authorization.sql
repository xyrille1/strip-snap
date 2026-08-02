-- Realtime Authorization: RLS policies on realtime.messages, scoping access to the
-- exact `session:{id}` channel topic a participant's token was minted for.
-- Source of truth: docs/online-photobooth-backend-schema.md §4 ("the one exception worth
-- naming") and §5 ("Server-side JWT verification").
--
-- This is DISTINCT from the table-RLS migration in 20260731114552_rls.sql, which locks down
-- application tables (`sessions`/`participants`/`strips`/`analytics_events`/etc). This
-- migration instead governs Supabase Realtime's Presence/Broadcast traffic on the
-- `session:{id}` channel, which is not a regular table read/write against those tables at
-- all — it's a private Realtime channel authorized via a short-lived, per-participant JWT
-- (signed with SUPABASE_JWT_SECRET, minted server-side by POST /api/sessions/:id/join, see
-- lib/realtimeAuth.ts) carrying a `topic` claim scoped to exactly one session's channel.
-- A realtime token minted for session A must never authorize presence/broadcast on session
-- B's channel — that is what these two policies enforce, checked against `realtime.topic()`
-- (the topic the connecting client is subscribing to) and the `topic` claim embedded in the
-- connection's JWT.
--
-- `realtime.messages` already has row level security enabled by default as part of the
-- Supabase Realtime extension itself (not something this migration turns on), with zero
-- policies out of the box — so prior to this migration, every request against it, including
-- one carrying an otherwise-valid `authenticated` role claim, was denied. These two policies
-- are the only grants against this table; they do not touch any application table's RLS.

create policy "session participants can receive broadcast and presence"
on "realtime"."messages"
for select
to authenticated
using (
  (select realtime.topic()) = (current_setting('request.jwt.claims', true)::json ->> 'topic')
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy "session participants can send broadcast and presence"
on "realtime"."messages"
for insert
to authenticated
with check (
  (select realtime.topic()) = (current_setting('request.jwt.claims', true)::json ->> 'topic')
  and realtime.messages.extension in ('broadcast', 'presence')
);
