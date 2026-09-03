-- محاكاة الحد الأدنى لمخططات Supabase عند اختبار migrations على PostgreSQL خام.
-- لا يُنشر إلى الإنتاج؛ تستخدمه scripts/test-migrations-postgres.sh فقط.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres nologin superuser; end if;
end $$;
grant anon, authenticated, service_role, supabase_auth_admin, postgres to current_user;

create schema auth;
create schema storage;
create schema extensions;

create extension if not exists pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  raw_app_meta_data jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}'
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(auth.jwt()->>'sub', ''))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(auth.jwt()->>'role', ''), current_user)
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket_id,name)
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select,insert,update,delete on storage.objects to authenticated,service_role;
grant select on storage.buckets to authenticated,service_role;
