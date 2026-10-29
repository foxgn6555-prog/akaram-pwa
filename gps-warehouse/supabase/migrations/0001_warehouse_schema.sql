-- 0001 — 00380: مستودع GPS التحليلي (المشروع الثاني). خادم فقط: لا سياسات RLS ⇒ لا يقرأ anon/authenticated شيئاً،
-- والوصول حصراً بمفتاح الخدمة من دوال المشروع الأول. كل ما هنا قابل لإعادة البناء من المزوّد/الأرشيف.
create extension if not exists pgcrypto;

create table if not exists public.wh_schema_version (version int primary key, applied_at timestamptz not null default now(), note text);
insert into public.wh_schema_version (version, note) values (1, '00380 أساس المستودع') on conflict (version) do nothing;

-- إعدادات المحرّك (صف واحد): حدود التوقف والاحتفاظ
create table if not exists public.wh_settings (
  id int primary key default 1 check (id = 1),
  min_stop_minutes int not null default 10 check (min_stop_minutes between 1 and 720),
  max_stop_minutes int not null default 120 check (max_stop_minutes between 2 and 1440),
  fault_stop_hours int not null default 24 check (fault_stop_hours between 2 and 720),
  cluster_radius_m int not null default 60 check (cluster_radius_m between 10 and 500),
  raw_retention_days int not null default 3 check (raw_retention_days between 1 and 31),
  archive_retention_months int not null default 6 check (archive_retention_months between 1 and 36),
  updated_at timestamptz not null default now(),
  constraint wh_settings_order check (min_stop_minutes < max_stop_minutes and fault_stop_hours * 60 > max_stop_minutes)
);
insert into public.wh_settings (id) values (1) on conflict (id) do nothing;

-- سجل الآليات (نسخة من المشروع الأول تُزامَن من دالة gps-warehouse) — المفتاح معرّف الآلية في المشروع الأول
create table if not exists public.wh_vehicles (
  vehicle_id uuid primary key,
  db_number text, vehicle_name text not null, plate_number text, sector_id int, sector_name text,
  device_id uuid, device_external_id text, device_name text,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);
create index if not exists wh_vehicles_device_idx on public.wh_vehicles (device_external_id) where active;

-- مهام السحب: جهاز × يوم (الشهر يُقسَّم إلى أيام؛ كل مهمة تُستأنف مستقلة)
create table if not exists public.wh_pull_jobs (
  id bigint generated always as identity primary key,
  device_external_id text not null,
  day date not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed','skipped')),
  attempts int not null default 0,
  points int not null default 0,
  stops int not null default 0,
  queued_at timestamptz not null default now(),
  next_try_at timestamptz not null default now(),
  started_at timestamptz, finished_at timestamptz,
  error_code text, error_message text,
  unique (device_external_id, day)
);
create index if not exists wh_pull_jobs_status_idx on public.wh_pull_jobs (status, next_try_at);
create index if not exists wh_pull_jobs_day_idx on public.wh_pull_jobs (day);

-- النقاط الخام: نافذة قصيرة فقط (raw_retention_days) — تُضغط إلى التخزين ثم تُحذف
create table if not exists public.wh_raw_points (
  device_external_id text not null,
  t timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  speed real, course real,
  day date not null,
  primary key (device_external_id, t)
);
create index if not exists wh_raw_points_day_idx on public.wh_raw_points (day);

-- التوقفات الشهرية (نتيجة المحرّك): الصنف يُحدَّد في 00382 — هنا البنية فقط
create table if not exists public.wh_stops (
  id bigint generated always as identity primary key,
  device_external_id text not null,
  vehicle_id uuid,
  day date not null,
  month date not null,
  started_at timestamptz not null, ended_at timestamptz not null,
  duration_s int not null check (duration_s >= 0),
  lat double precision not null, lng double precision not null,
  class text not null default 'pending' check (class in ('pending','short','valid','long','fault')),
  address text,
  computed_at timestamptz not null default now(),
  unique (device_external_id, started_at),
  constraint wh_stops_order check (ended_at >= started_at)
);
create index if not exists wh_stops_month_class_idx on public.wh_stops (month, class);
create index if not exists wh_stops_vehicle_day_idx on public.wh_stops (vehicle_id, day);

-- ملفات الأرشيف المضغوطة في التخزين (دلو gps-archive): جهاز × يوم
create table if not exists public.wh_archive_files (
  id bigint generated always as identity primary key,
  device_external_id text not null, day date not null,
  path text not null unique, bytes bigint not null default 0, points int not null default 0,
  created_at timestamptz not null default now(),
  unique (device_external_id, day)
);

-- خادم فقط: RLS بلا سياسات + سحب كل الصلاحيات من الأدوار العامة
do $$ declare t text; begin
  foreach t in array array['wh_schema_version','wh_settings','wh_vehicles','wh_pull_jobs','wh_raw_points','wh_stops','wh_archive_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- فحص الاتصال: الإصدار + الأعداد + الإعدادات (تُستدعى بمفتاح الخدمة فقط)
create or replace function public.wh_ping() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', (select max(version) from public.wh_schema_version),
    'vehicles', (select count(*) from public.wh_vehicles where active),
    'jobs', jsonb_build_object(
      'queued', (select count(*) from public.wh_pull_jobs where status = 'queued'),
      'running', (select count(*) from public.wh_pull_jobs where status = 'running'),
      'done', (select count(*) from public.wh_pull_jobs where status = 'done'),
      'failed', (select count(*) from public.wh_pull_jobs where status = 'failed')),
    'raw_points', (select count(*) from public.wh_raw_points),
    'stops', (select count(*) from public.wh_stops),
    'archive_files', (select count(*) from public.wh_archive_files),
    'db_bytes', pg_database_size(current_database()),
    'settings', (select to_jsonb(s) - 'id' from public.wh_settings s where id = 1),
    'server_time', now());
$$;

-- مزامنة سجل الآليات من المشروع الأول: القائمة كاملة؛ ما ليس فيها يُعطَّل (لا يُحذف — التوقفات القديمة تبقى منسوبة)
create or replace function public.wh_upsert_vehicles(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_up int := 0; n_off int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'WH_VEHICLES_INVALID'; end if;
  with src as (
    select (x ->> 'vehicle_id')::uuid vehicle_id, x ->> 'db_number' db_number, coalesce(x ->> 'vehicle_name', '') vehicle_name, x ->> 'plate_number' plate_number,
           (x ->> 'sector_id')::int sector_id, x ->> 'sector_name' sector_name, (x ->> 'device_id')::uuid device_id, x ->> 'device_external_id' device_external_id, x ->> 'device_name' device_name
    from jsonb_array_elements(p_rows) x where x ->> 'vehicle_id' is not null
  ), up as (
    insert into public.wh_vehicles as v (vehicle_id, db_number, vehicle_name, plate_number, sector_id, sector_name, device_id, device_external_id, device_name, active, synced_at)
    select vehicle_id, db_number, vehicle_name, plate_number, sector_id, sector_name, device_id, device_external_id, device_name, true, now() from src
    on conflict (vehicle_id) do update set db_number = excluded.db_number, vehicle_name = excluded.vehicle_name, plate_number = excluded.plate_number, sector_id = excluded.sector_id,
      sector_name = excluded.sector_name, device_id = excluded.device_id, device_external_id = excluded.device_external_id, device_name = excluded.device_name, active = true, synced_at = now()
    returning 1
  ) select count(*) into n_up from up;
  update public.wh_vehicles v set active = false, synced_at = now()
    where v.active and v.vehicle_id is not null and not exists (select 1 from jsonb_array_elements(p_rows) x where (x ->> 'vehicle_id')::uuid = v.vehicle_id);
  get diagnostics n_off = row_count;
  return jsonb_build_object('upserted', n_up, 'deactivated', n_off, 'active', (select count(*) from public.wh_vehicles where active));
end $$;

-- جدولة شهر: مهمة لكل جهاز نشط × كل يوم من الشهر حتى اليوم (ما هو منجز لا يُعاد)
create or replace function public.wh_enqueue_month(p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; n int;
begin
  if p_month is null then raise exception 'WH_MONTH_REQUIRED'; end if;
  if m > date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date then raise exception 'WH_MONTH_IN_FUTURE'; end if;
  with days as (select d::date as day from generate_series(m, least((m + interval '1 month' - interval '1 day')::date, (now() at time zone 'Asia/Baghdad')::date - 1), interval '1 day') d),
  ins as (
    insert into public.wh_pull_jobs (device_external_id, day)
    select v.device_external_id, days.day from public.wh_vehicles v cross join days where v.active and v.device_external_id is not null
    on conflict (device_external_id, day) do update set status = 'queued', next_try_at = now(), error_code = null, error_message = null
      where public.wh_pull_jobs.status = 'failed'
    returning 1
  ) select count(*) into n from ins;
  return jsonb_build_object('month', m, 'queued', n, 'total', (select count(*) from public.wh_pull_jobs where day >= m and day < (m + interval '1 month')::date));
end $$;

revoke all on function public.wh_ping(), public.wh_upsert_vehicles(jsonb), public.wh_enqueue_month(date) from public, anon, authenticated;
