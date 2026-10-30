-- 0005 (00383): محرّك البقع — تجميع التوقفات الصالحة إلى بقع، أصناف المدة الثلاثة، درجات التكرار، تعدد الآليات، ملخص للنسخ الليلي
-- يعمل داخل المستودع فقط؛ المشروع الأول يستلم الملخص الصغير (wh_hotspots_summary) عبر الجسر.
insert into public.wh_schema_version (version, note) values (5, '00383 محرّك البقع') on conflict (version) do nothing;

alter table public.wh_settings add column if not exists hotspot_radius_m int not null default 80 check (hotspot_radius_m between 20 and 500);
alter table public.wh_settings add column if not exists class_light_max_min int not null default 20 check (class_light_max_min between 5 and 240);
alter table public.wh_settings add column if not exists class_medium_max_min int not null default 60 check (class_medium_max_min between 10 and 720);
alter table public.wh_settings add column if not exists recur_mid_days int not null default 3 check (recur_mid_days between 2 and 31);
alter table public.wh_settings add column if not exists recur_high_days int not null default 10 check (recur_high_days between 3 and 31);
alter table public.wh_stops add column if not exists hotspot_id bigint;
create index if not exists wh_stops_unassigned_idx on public.wh_stops (month) where class = 'valid' and hotspot_id is null;

create table if not exists public.wh_hotspots (
  id bigint generated always as identity primary key,
  month date not null,
  lat double precision not null, lng double precision not null,
  stops_count int not null default 0, days_count int not null default 0, vehicles_count int not null default 0,
  total_minutes int not null default 0, avg_minutes int not null default 0, max_minutes int not null default 0,
  light_count int not null default 0, medium_count int not null default 0, heavy_count int not null default 0,
  dominant_class text, recurrence text not null default 'once' check (recurrence in ('once','recurring','frequent')),
  first_at timestamptz, last_at timestamptz,
  sector_ids int[] not null default '{}', sector_names text[] not null default '{}',
  vehicles jsonb not null default '[]', days date[] not null default '{}', hours int[] not null default '{}',
  dirty boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists wh_hotspots_month_idx on public.wh_hotspots (month, lat, lng);
create index if not exists wh_hotspots_dirty_idx on public.wh_hotspots (month) where dirty;
alter table public.wh_hotspots enable row level security;
revoke all on table public.wh_hotspots from anon, authenticated;

-- صنف المدة (بالدقائق) حسب الإعدادات
create or replace function public.wh_duration_class(p_minutes int, s public.wh_settings) returns text
language sql immutable as $$
  select case when p_minutes <= s.class_light_max_min then 'light' when p_minutes <= s.class_medium_max_min then 'medium' else 'heavy' end
$$;

-- إسناد التوقفات الصالحة غير المسندة إلى أقرب بقعة ضمن نصف القطر (مركز متحرك) أو إنشاء بقعة — تدريجي بحدّ لكل نداء
create or replace function public.wh_hotspots_assign(p_limit int default 2000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; st record; h_id bigint; n int := 0; created int := 0; dlat double precision; dlng double precision;
begin
  select * into s from public.wh_settings where id = 1;
  dlat := s.hotspot_radius_m / 111320.0;
  for st in select id, month, lat, lng from public.wh_stops where class = 'valid' and hotspot_id is null and month >= public.wh_cutoff()
            order by month, started_at limit greatest(1, least(coalesce(p_limit, 2000), 20000)) loop
    dlng := dlat / greatest(cos(radians(st.lat)), 0.2);
    select h.id into h_id from public.wh_hotspots h
      where h.month = st.month and h.lat between st.lat - dlat and st.lat + dlat and h.lng between st.lng - dlng and st.lng + dlng
        and public.wh_haversine_m(h.lat, h.lng, st.lat, st.lng) <= s.hotspot_radius_m
      order by public.wh_haversine_m(h.lat, h.lng, st.lat, st.lng) limit 1;
    if h_id is null then
      insert into public.wh_hotspots (month, lat, lng) values (st.month, st.lat, st.lng) returning id into h_id;
      created := created + 1;
    else
      -- المركز = متوسط متحرك (يحافظ على الدقة دون إعادة حساب كامل)
      update public.wh_hotspots h set lat = (h.lat * h.stops_count + st.lat) / (h.stops_count + 1), lng = (h.lng * h.stops_count + st.lng) / (h.stops_count + 1), dirty = true where h.id = h_id;
    end if;
    update public.wh_stops set hotspot_id = h_id where id = st.id;
    update public.wh_hotspots set stops_count = stops_count + 1, dirty = true where id = h_id;
    n := n + 1;
  end loop;
  return jsonb_build_object('assigned', n, 'created', created,
    'remaining', (select count(*) from public.wh_stops where class = 'valid' and hotspot_id is null and month >= public.wh_cutoff()));
end $$;

-- إعادة حساب مجاميع البقع المتغيرة (dirty) من توقفاتها: الأصناف، التكرار، الآليات، القواطع، الأيام، الساعات
create or replace function public.wh_hotspots_aggregate(p_limit int default 500) returns int
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; n int := 0; h record;
begin
  select * into s from public.wh_settings where id = 1;
  for h in select id from public.wh_hotspots where dirty order by updated_at limit greatest(1, least(coalesce(p_limit, 500), 5000)) loop
    with x as (
      select st.*, round(st.duration_s / 60.0)::int as minutes, public.wh_duration_class(round(st.duration_s / 60.0)::int, s) as dclass,
             v.vehicle_name, v.db_number, v.sector_id, v.sector_name, extract(hour from st.started_at at time zone 'Asia/Baghdad')::int as hr
      from public.wh_stops st left join public.wh_vehicles v on v.device_external_id = st.device_external_id and v.active
      where st.hotspot_id = h.id),
    agg as (
      select count(*) c, count(distinct day) d, count(distinct device_external_id) vc, sum(minutes) tm, round(avg(minutes))::int am, max(minutes) mm,
             count(*) filter (where dclass = 'light') lc, count(*) filter (where dclass = 'medium') mc, count(*) filter (where dclass = 'heavy') hc,
             min(started_at) fa, max(ended_at) la, avg(lat) clat, avg(lng) clng,
             array_remove(array_agg(distinct sector_id), null) sids, array_remove(array_agg(distinct sector_name), null) snames,
             array_agg(distinct day order by day) days
      from x),
    veh as (select coalesce(jsonb_agg(jsonb_build_object('device', device_external_id, 'name', coalesce(vehicle_name, device_external_id), 'db_number', db_number, 'sector', sector_name, 'stops', c, 'minutes', tm) order by c desc), '[]'::jsonb) j
            from (select device_external_id, max(vehicle_name) vehicle_name, max(db_number) db_number, max(sector_name) sector_name, count(*) c, sum(minutes) tm from x group by device_external_id) q),
    hrs as (select array_agg(coalesce(c, 0) order by hh) a from generate_series(0, 23) hh left join (select hr, count(*) c from x group by hr) q on q.hr = hh)
    update public.wh_hotspots t set
      stops_count = agg.c, days_count = agg.d, vehicles_count = agg.vc, total_minutes = coalesce(agg.tm, 0), avg_minutes = coalesce(agg.am, 0), max_minutes = coalesce(agg.mm, 0),
      light_count = agg.lc, medium_count = agg.mc, heavy_count = agg.hc,
      dominant_class = case when agg.hc >= agg.mc and agg.hc >= agg.lc and agg.hc > 0 then 'heavy' when agg.mc >= agg.lc and agg.mc > 0 then 'medium' else 'light' end,
      recurrence = case when agg.d >= s.recur_high_days then 'frequent' when agg.d >= s.recur_mid_days then 'recurring' else 'once' end,
      first_at = agg.fa, last_at = agg.la, lat = coalesce(agg.clat, t.lat), lng = coalesce(agg.clng, t.lng),
      sector_ids = coalesce(agg.sids, '{}'), sector_names = coalesce(agg.snames, '{}'), vehicles = veh.j, days = coalesce(agg.days, '{}'), hours = coalesce(hrs.a, '{}'),
      dirty = false, updated_at = now()
    from agg, veh, hrs where t.id = h.id;
    n := n + 1;
  end loop;
  -- بقع فقدت كل توقفاتها (إعادة حساب يوم) تُحذف
  delete from public.wh_hotspots t where t.stops_count = 0 and not exists (select 1 from public.wh_stops st where st.hotspot_id = t.id);
  return n;
end $$;

-- التحديث الكامل التدريجي: إسناد ثم تجميع (يُستدعى من الصيانة كل دورة ومن النسخ الليلي حتى الاكتمال)
create or replace function public.wh_hotspots_refresh(p_limit int default 2000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb; g int;
begin
  a := public.wh_hotspots_assign(p_limit);
  g := public.wh_hotspots_aggregate(500);
  return a || jsonb_build_object('aggregated', g, 'dirty', (select count(*) from public.wh_hotspots where dirty));
end $$;

-- إعادة بناء شهر من الصفر (عند تغيير نصف القطر أو الأصناف) — IT عبر الجسر
create or replace function public.wh_hotspots_rebuild(p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date;
begin
  delete from public.wh_hotspots where month = m;
  update public.wh_stops set hotspot_id = null where month = m and hotspot_id is not null;
  return jsonb_build_object('month', m, 'reset', true);
end $$;

-- الملخص للنسخ إلى المشروع الأول (صفحات)
create or replace function public.wh_hotspots_summary(p_month date, p_limit int default 500, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'month', date_trunc('month', p_month)::date,
    'total', (select count(*) from public.wh_hotspots where month = date_trunc('month', p_month)::date and not dirty),
    'pending', (select count(*) from public.wh_stops where class = 'valid' and hotspot_id is null and month = date_trunc('month', p_month)::date) + (select count(*) from public.wh_hotspots where month = date_trunc('month', p_month)::date and dirty),
    'rows', coalesce((select jsonb_agg(to_jsonb(h) - 'dirty' - 'updated_at' order by h.id) from (
        select * from public.wh_hotspots where month = date_trunc('month', p_month)::date and not dirty order by id limit greatest(1, least(coalesce(p_limit, 500), 2000)) offset greatest(coalesce(p_offset, 0), 0)) h), '[]'::jsonb))
$$;

-- الصيانة تضم تحديث البقع؛ التدوير يمسح بقع ما قبل النافذة
create or replace function public.wh_rollover() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c date := public.wh_cutoff(); n_jobs int; n_raw int; n_stops int; n_hot int; r jsonb;
begin
  delete from public.wh_raw_points where day < c; get diagnostics n_raw = row_count;
  delete from public.wh_stops where day < c; get diagnostics n_stops = row_count;
  delete from public.wh_pull_jobs where day < c; get diagnostics n_jobs = row_count;
  delete from public.wh_hotspots where month < c; get diagnostics n_hot = row_count;
  r := jsonb_build_object('cutoff', c, 'jobs', n_jobs, 'raw', n_raw, 'stops', n_stops, 'hotspots', n_hot);
  if n_jobs + n_raw + n_stops + n_hot > 0 then update public.wh_settings set last_rollover_at = now(), last_rollover = r where id = 1; end if;
  return r;
end $$;
create or replace function public.wh_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; n int; cutoff date; enq jsonb; roll jsonb; hot jsonb;
begin
  select * into s from public.wh_settings where id = 1;
  cutoff := (now() at time zone 'Asia/Baghdad')::date - s.raw_retention_days;
  delete from public.wh_raw_points r where r.day < cutoff and r.device_external_id is not null
    and exists (select 1 from public.wh_pull_jobs j where j.device_external_id = r.device_external_id and j.day = r.day and j.status = 'done');
  get diagnostics n = row_count;
  enq := case when s.paused then jsonb_build_object('queued', 0, 'skipped', 'paused') else public.wh_daily_enqueue() end;
  roll := public.wh_rollover();
  hot := public.wh_hotspots_refresh(1000);
  return jsonb_build_object('raw_deleted', n, 'cutoff', cutoff, 'enqueue', enq, 'rollover', roll, 'hotspots', hot);
end $$;

-- wh_ping يضم عدد البقع
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
    'hotspots', (select count(*) from public.wh_hotspots),
    'hotspots_by_month', coalesce((select jsonb_object_agg(to_char(month, 'YYYY-MM'), c) from (select month, count(*) c from public.wh_hotspots group by month) q), '{}'::jsonb),
    'archive_files', (select count(*) from public.wh_archive_files),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0) from storage.objects o),
    'storage_objects', (select count(*) from storage.objects),
    'settings', (select to_jsonb(s) - 'id' - 'pull_locked_until' from public.wh_settings s where id = 1),
    'progress', public.wh_progress(),
    'server_time', now());
$$;

revoke all on function public.wh_duration_class(int, public.wh_settings), public.wh_hotspots_assign(int), public.wh_hotspots_aggregate(int), public.wh_hotspots_refresh(int),
  public.wh_hotspots_rebuild(date), public.wh_hotspots_summary(date, int, int), public.wh_rollover(), public.wh_maintenance(), public.wh_ping() from public, anon, authenticated;

-- حذف توقف (إعادة حساب يوم / تدوير) يعلّم بقعته لإعادة التجميع
create or replace function public.wh_stops_hotspot_dirty() returns trigger
language plpgsql as $$
begin
  if old.hotspot_id is not null then update public.wh_hotspots set dirty = true where id = old.hotspot_id; end if;
  return old;
end $$;
drop trigger if exists wh_stops_hotspot_dirty on public.wh_stops;
create trigger wh_stops_hotspot_dirty after delete on public.wh_stops for each row execute function public.wh_stops_hotspot_dirty();
