-- Employee sign-in guard + confidential support inbox.
-- All application access is mediated by service-role Edge Functions.

create table if not exists public.login_source_locks (
  normalized_email text not null,
  source_hash text not null,
  failure_count integer not null default 0 check (failure_count between 0 and 10),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (normalized_email, source_hash)
);

alter table public.login_source_locks enable row level security;
revoke all on public.login_source_locks from public, anon, authenticated;
grant all on public.login_source_locks to service_role;

create or replace function public.login_guard_status(p_email text, p_source_hash text)
returns table (failure_count integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Expired locks start a fresh window; only this email + source pair is reset.
  delete from public.login_source_locks l
   where l.normalized_email = lower(trim(p_email))
     and l.source_hash = p_source_hash
     and l.locked_until is not null
     and l.locked_until <= clock_timestamp();

  return query
    select l.failure_count, l.locked_until
      from public.login_source_locks l
     where l.normalized_email = lower(trim(p_email))
       and l.source_hash = p_source_hash;
end;
$$;
revoke all on function public.login_guard_status(text, text) from public, anon, authenticated;
grant execute on function public.login_guard_status(text, text) to service_role;

create or replace function public.login_guard_record_failure(p_email text, p_source_hash text)
returns table (failure_count integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_locked timestamptz;
begin
  insert into public.login_source_locks as current_lock
    (normalized_email, source_hash, failure_count, window_started_at, locked_until, updated_at)
  values
    (lower(trim(p_email)), p_source_hash, 1, clock_timestamp(), null, clock_timestamp())
  on conflict (normalized_email, source_hash) do update set
    failure_count = case
      when current_lock.window_started_at < clock_timestamp() - interval '15 minutes' then 1
      else least(current_lock.failure_count + 1, 10)
    end,
    window_started_at = case
      when current_lock.window_started_at < clock_timestamp() - interval '15 minutes' then clock_timestamp()
      else current_lock.window_started_at
    end,
    locked_until = case
      when (case
        when current_lock.window_started_at < clock_timestamp() - interval '15 minutes' then 1
        else current_lock.failure_count + 1
      end) >= 10 then clock_timestamp() + interval '5 minutes'
      else null
    end,
    updated_at = clock_timestamp()
  returning current_lock.failure_count, current_lock.locked_until into v_count, v_locked;

  return query select v_count, v_locked;
end;
$$;
revoke all on function public.login_guard_record_failure(text, text) from public, anon, authenticated;
grant execute on function public.login_guard_record_failure(text, text) to service_role;

create or replace function public.login_guard_record_success(p_email text, p_source_hash text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.login_source_locks
   where normalized_email = lower(trim(p_email))
     and source_hash = p_source_hash;
$$;
revoke all on function public.login_guard_record_success(text, text) from public, anon, authenticated;
grant execute on function public.login_guard_record_success(text, text) to service_role;

create table if not exists public.login_support_settings (
  id boolean primary key default true check (id = true),
  support_phone text,
  business_hours text,
  is_online boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.login_support_settings (id) values (true) on conflict (id) do nothing;
alter table public.login_support_settings enable row level security;
revoke all on public.login_support_settings from public, anon, authenticated;
grant all on public.login_support_settings to service_role;

create table if not exists public.login_support_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  employee_email text not null,
  employee_number text not null,
  employee_name text not null,
  access_token_hash text not null,
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists login_support_requests_status_updated_idx
  on public.login_support_requests (status, last_message_at desc);
create index if not exists login_support_requests_email_created_idx
  on public.login_support_requests (employee_email, created_at desc);
alter table public.login_support_requests enable row level security;
revoke all on public.login_support_requests from public, anon, authenticated;
grant all on public.login_support_requests to service_role;

create table if not exists public.login_support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.login_support_requests(id) on delete cascade,
  sender text not null check (sender in ('employee', 'support', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists login_support_messages_request_created_idx
  on public.login_support_messages (request_id, created_at);
alter table public.login_support_messages enable row level security;
revoke all on public.login_support_messages from public, anon, authenticated;
grant all on public.login_support_messages to service_role;
