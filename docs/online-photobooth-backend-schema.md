# Backend Schema — Online Photobooth

Status: Draft v1 — extends `online-photobooth-trd.md` §4/§5. This is the schema source of truth for implementation; the TRD's data model sketch is superseded by this document.

## 1. Design principles

1. **All table access goes through the Next.js API layer**, using the Supabase service role key server-side. Client browsers never talk to Postgres directly — only to the Realtime channel (presence/broadcast, no table rows) and to Supabase Storage via signed URLs. This means the app-level authorization logic in the API routes is the real security boundary, and RLS is the backstop, not the primary gate.
2. **RLS is enabled and deny-by-default on every table.** No `anon` or `authenticated` role gets a permissive policy for direct table reads/writes. This closes off the standard Supabase footgun where a leaked anon key exposes the whole database.
3. **Non-guessable identifiers everywhere.** All primary keys are UUIDv4. No sequential integer IDs anywhere in the schema, since session/strip IDs double as the access-control mechanism (per PRD §"Non-functional requirements").
4. **Cascade deletes model the actual data lifecycle.** A session's participants and strips shouldn't outlive the session; account deletion shouldn't leave orphaned rows.
5. **Design for the free-tier now, but don't paint into a corner.** Indexes and an aggregation table are included up front since retrofitting them under load is more expensive than adding them at MVP time, even though volume is tiny (100 sessions/30 days target).

## 2. Entity-relationship overview

```
app_users ─┐
           │ 1:N (host_user_id, nullable)
           ▼
        sessions ─── 1:N ──▶ participants ──▶ (references app_users, nullable)
           │
           └────────── 1:N ──▶ strips
                                   │
        sessions ─── 1:N ──▶ analytics_events (references app_users, nullable)

daily_metrics  (independent rollup table, written by scheduled job, not FK'd)
```

## 3. Tables

### 3.1 `app_users`

Local mirror of Clerk users, kept in sync via Clerk webhook (`user.created`, `user.updated`, `user.deleted`). Exists so other tables can FK against a stable local ID instead of trusting a bare text `clerk_id` everywhere, and so account deletion has one place to cascade from.

```sql
create table app_users (
  id            uuid primary key default gen_random_uuid(),
  clerk_id      text not null unique,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz         -- soft delete: set on Clerk user.deleted webhook
);

create index idx_app_users_clerk_id on app_users (clerk_id);
```

No email, name, or other PII is duplicated here — Clerk remains the single source of truth for identity data. This table exists purely for FK stability and cascade behavior.

### 3.2 `sessions`

```sql
create type session_mode as enum ('solo', 'invite');
create type session_format as enum ('3', '4');
create type session_status as enum ('waiting', 'counting', 'capturing', 'done', 'expired');

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
```

`host_user_id` uses `on delete set null` rather than cascade — deleting a user account shouldn't erase a session other participants are actively using; it just orphans the host reference.

### 3.3 `participants`

```sql
create type participant_status as enum ('connected', 'ready', 'captured', 'dropped');

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
```

`display_name` is deliberately freeform and capped at 40 chars (not tied to real identity) — matches the PRD's minimal-PII posture. The composite unique constraint stops a logged-in user from occupying two waiting-room slots; anonymous participants (`user_id is null`) are exempt since Postgres treats `null` as distinct in unique constraints, which is the correct behavior here (multiple anonymous joiners are expected).

### 3.4 `strips`

```sql
create table strips (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  style_preset   text not null,
  storage_path   text not null,       -- Supabase Storage object path, not a raw public URL
  created_at     timestamptz not null default now()
);

create index idx_strips_session_id on strips (session_id);
```

Note the change from the TRD's `image_url` to `storage_path`: storing the bucket path instead of a baked-in signed URL means expired signed URLs can be re-issued on demand (`GET /api/strips/:id` mints a fresh short-lived signed URL server-side) rather than the database holding a URL that silently stops working.

### 3.5 `analytics_events`

```sql
create type analytics_event_type as enum ('session_started', 'strip_completed');

create table analytics_events (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references sessions(id) on delete set null,
  event          analytics_event_type not null,
  user_id        uuid references app_users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index idx_analytics_events_event_created on analytics_events (event, created_at);
create index idx_analytics_events_session_id on analytics_events (session_id);
```

`on delete set null` on both FKs (not cascade) — a session or user disappearing shouldn't erase the historical count that already happened; that would corrupt the "100 sessions in 30 days" metric retroactively.

### 3.6 `daily_metrics` (rollup, not part of the live write path)

```sql
create table daily_metrics (
  day                  date primary key,
  sessions_started     integer not null default 0,
  strips_completed     integer not null default 0,
  unique_participants  integer not null default 0
);
```

Populated by a nightly scheduled job (Supabase Edge Function or Vercel Cron) that aggregates `analytics_events` for the prior day. Exists so the metrics dashboard queries one small table instead of scanning `analytics_events` as it grows — cheap to add now, expensive to retrofit once there's a dashboard depending on raw-table scans.

## 4. Row-Level Security

Every table above: `alter table <table> enable row level security;` with **no policies added** beyond what's listed here. An RLS-enabled table with zero policies denies all access to `anon`/`authenticated` roles by default, which is the intended state — the service role (used only server-side in API routes) bypasses RLS entirely and is the sole write/read path.

```sql
alter table app_users        enable row level security;
alter table sessions         enable row level security;
alter table participants     enable row level security;
alter table strips           enable row level security;
alter table analytics_events enable row level security;
alter table daily_metrics    enable row level security;
```

The one exception worth naming: Supabase Realtime's Presence/Broadcast on the `session:{id}` channel is not a table and isn't governed by these RLS policies — it's authorized separately via a Realtime Authorization policy scoped to channel topic, keyed off a short-lived token the API issues when a participant joins. That token proves "you're a participant of session X," nothing more — it grants no table access.

## 5. Security posture (beyond RLS)

- **Server-side JWT verification.** Every API route that mutates state (`/upgrade`, `/join`, `/strips`) verifies the Clerk session server-side; never trust a client-supplied `user_id`.
- **Zod (or equivalent) validation at every API boundary** — reject malformed `session_id`, oversized `display_name`, unrecognized `style_preset` values before they reach the database.
- **Storage access via short-lived signed URLs only** (5–15 min expiry), minted on request — the bucket itself is private, not public-read. Closes the gap where a leaked `storage_path` alone would grant permanent access.
- **Rate limiting on session creation and join endpoints** (e.g., Upstash Redis or Vercel Edge Config on IP + a coarse fingerprint) to prevent trivial abuse of the free-tier compute/storage budget — the TRD's 100-sessions/30-days target makes this cheap to enforce with a low threshold (e.g., 10 session creations/hour/IP).
- **CORS locked to the app's own origin** on all API routes; the Supabase anon key used for Realtime is scoped to presence/broadcast only, never table grants (per §4).
- **No secrets in the client bundle** — service role key and Clerk secret key live only in server-side environment variables, never in `NEXT_PUBLIC_*` vars.
- **Data minimization** — no raw photo ever reaches the server (per TRD §3, client-side compositing); the database never stores anything more identifying than a Clerk ID reference and a freeform display name.

## 6. Scalability notes

- Indexes above are chosen for the actual query patterns: cleanup jobs scanning `sessions` by `status + expires_at`, participant lookups by `session_id`, and metrics queries by `event + created_at`.
- `daily_metrics` (§3.6) keeps the analytics dashboard cheap regardless of how large `analytics_events` grows.
- Supabase's pooled connection string (pgbouncer) should be used for all serverless/edge API routes from day one — this is free-tier-compatible and avoids a connection-exhaustion rewrite later if usage spikes.
- If `analytics_events` grows large enough to matter (well past MVP volume), the standard next step is a monthly partition or an archive-to-cold-storage job past 90 days — noted here as a known lever, not needed at MVP scale.
- None of this requires read replicas or sharding at MVP volume; flagged only so a future scaling pass has a documented starting point instead of starting from zero.

## 7. Data retention & deletion

- `sessions.expires_at` (24h TTL, per TRD `[ASSUMPTION]`) is enforced by a scheduled job that sets `status = 'expired'` and, on a short delay after that, deletes the row — cascading to `participants` and `strips` via `on delete cascade` (§3.2–3.4).
- Account deletion (Clerk `user.deleted` webhook) soft-deletes the `app_users` row (`deleted_at`); FKs from `sessions`/`participants`/`analytics_events` are `on delete set null`, so a user's account disappearing doesn't retroactively delete other participants' shared strips or corrupt historical metrics.
- Finalized strips in Storage are deleted in the same cleanup job pass as their owning session, based on `strips.storage_path`, so expired sessions don't leave orphaned files accumulating against the free-tier storage quota.

## 8. Open items to confirm before build

Carried over from the TRD, since they affect this schema directly:

- Whether the 4-photo unlock should require every participant logged in (would add a check across all `participants` rows, not just one) vs. the current one-logged-in-participant model reflected in §3.2/§3.3.
- Whether a dropped participant mid-countdown should block capture until reconnect (would need a `participants.status = 'dropped'` handling path in the capture API) or proceed with an empty slot, as currently modeled.
