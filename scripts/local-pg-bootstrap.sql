-- ═══════════════════════════════════════════════════════════════
-- Minimal Supabase-compatible shim for a PLAIN local PostgreSQL 17
-- (no Docker/Supabase CLI available in this sandbox).
-- Provides: auth schema + auth.users + auth.uid()/auth.jwt() stubs,
-- gen_random_uuid, and a session var to impersonate a user for tests.
-- This is ONLY for local verification of migrations/RLS/RPC logic —
-- NOT a replacement for the real Supabase local stack.
-- ═══════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

-- impersonation: set with `select set_config('app.current_user_id', '<uuid>', false);`
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('app.current_jwt', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(current_setting('app.current_role', true), 'authenticated')
$$;

-- real Supabase grants usage on auth schema + execute on these helpers to PUBLIC
grant usage on schema auth to public;
grant execute on function auth.uid() to public;
grant execute on function auth.jwt() to public;
grant execute on function auth.role() to public;
grant select on auth.users to authenticated, service_role;

-- ── storage schema stub (migration 00015_storage_buckets.sql depends on it) ──
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text,
  owner       uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

-- ── default grants (real Supabase does this automatically for new tables) ──
-- Must run AFTER all migrations create their tables — call this block again
-- post-migration, or rely on the ALTER DEFAULT PRIVILEGES below for future ones.
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, anon, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon, service_role;
