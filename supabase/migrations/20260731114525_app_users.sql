-- Local mirror of Clerk users, kept in sync via Clerk webhook (user.created, user.updated, user.deleted).
-- Source of truth: docs/online-photobooth-backend-schema.md §3.1
-- No email, name, or other PII is duplicated here — Clerk remains the single source of truth for identity data.

create table app_users (
  id            uuid primary key default gen_random_uuid(),
  clerk_id      text not null unique,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz         -- soft delete: set on Clerk user.deleted webhook
);

create index idx_app_users_clerk_id on app_users (clerk_id);
