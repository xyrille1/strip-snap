-- Extensions and enum types shared across the schema.
-- Source of truth: docs/online-photobooth-backend-schema.md §3

create extension if not exists pgcrypto;

create type session_mode as enum ('solo', 'invite');
create type session_format as enum ('3', '4');
create type session_status as enum ('waiting', 'counting', 'capturing', 'done', 'expired');

create type participant_status as enum ('connected', 'ready', 'captured', 'dropped');

create type analytics_event_type as enum ('session_started', 'strip_completed');
