-- ═══════════════════════════════════════════════════════════════
-- محاكاة بيئة Supabase على PostgreSQL محلي (لاختبار الميجريشنات)
-- يُطبَّق على قاعدة فارغة قبل 00001: مخطط auth + storage + الأدوار
-- ═══════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gin;
create extension if not exists pg_trgm;

-- ── مخطط auth (Supabase GoTrue مبسّط) ──
create schema if not exists auth;
grant usage on schema auth to public;

create table if not exists auth.users (
  id                uuid primary key default gen_random_uuid(),
  email             text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);
grant select on auth.users to anon, authenticated, service_role;

-- uid من الجلسة (يُضبط عبر set role + set local)
create or replace function auth.uid()
returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('auth.user_id', true), '')::uuid;
$$;
grant execute on function auth.uid() to public;

create or replace function auth.jwt()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('auth.jwt', true), '')::jsonb, '{}'::jsonb);
$$;
grant execute on function auth.jwt() to public;

create or replace function auth.role()
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('auth.role', true), ''), current_user);
$$;
grant execute on function auth.role() to public;

create or replace function auth.email()
returns text
language sql stable
set search_path = ''
as $$
  select u.email from auth.users u where u.id = auth.uid();
$$;
grant execute on function auth.email() to public;

-- ── مخطط storage (Storage API مبسّط) ──
create schema if not exists storage;
grant usage on schema storage to public;

create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  avif_autotranscode  boolean not null default false,
  owner               uuid,
  created_at          timestamptz default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text not null,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;

-- نفس توقيع/سلوك Supabase: مجلدات المسار بدون اسم الملف
-- https://github.com/supabase/storage-api : string_to_array(name,'/')[:-1]
create or replace function storage.foldername(name text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select (string_to_array($1, '/'))[1 : array_length(string_to_array($1,'/'), 1) - 1];
$$;

-- ── أدوار Supabase الإدارية (تُسنَد لها الملكيات في الميجريشنات) ──
do $$
declare r text;
begin
  foreach r in array array[
    'supabase_auth_admin','supabase_storage_admin','dashboard_user',
    'authenticator','pgbouncer','supabase_admin'
  ] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
grant supabase_auth_admin to postgres;
grant supabase_storage_admin to postgres;

-- Supabase يمنح أدوار الطلب امتيازات افتراضية على المخطط العام (RLS يقيّد الصفوف)
grant usage on schema public, app, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, app to anon, authenticated, service_role;

-- helper مريح للاختبار اليدوي: تثبيت هوية الجلسة
create or replace function auth.set_test_user(p_uid uuid)
returns void language sql as $$
  select set_config('auth.user_id', coalesce(p_uid::text,''), true);
$$;
