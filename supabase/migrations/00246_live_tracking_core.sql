-- 00246 · البث المباشر (الأساس) — مشاركة الموقع المباشر لمسؤول القسم والمتعهد أثناء الشفت فقط
-- ─────────────────────────────────────────────────────────────────────────────
--   · الخصوصية أولاً: لا تُقبل أي نقطة خارج نافذة شفت HR للحساب (من employee_shift_assignments/hr_shifts). بلا شفت ⇒ ممنوع (LIVE_NO_SHIFT).
--   · الجلسة تنتهي تلقائياً بنهاية الشفت (ended_at = shift_end) أو يدوياً. لا تتبع خلفي: النقاط تصل فقط والتطبيق مفتوح.
--   · داخل/خارج الزون: مقارنة بزونات المنطقة (gps_geofences.sector_id) المسندة للحساب؛ null إن لم تُعرَّف زونات.
--   · الإعدادات (فاصل الإرسال/مدة الاحتفاظ) في التطوير المركزية. القراءة لغرفة العمليات والمدير المفوض فقط.
--   · الجداول مقفلة بـ RLS بلا سياسات: كل الوصول عبر دوال security definer.

create table if not exists public.live_track_settings (
  id smallint primary key default 1 check (id = 1),
  ping_interval_minutes integer not null default 15 check (ping_interval_minutes between 1 and 120),
  retention_days integer not null default 30 check (retention_days between 7 and 3650),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.live_track_settings (id) values (1) on conflict (id) do nothing;
alter table public.live_track_settings enable row level security;

create table if not exists public.live_track_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('manager','contractor')),
  sectors smallint[] not null default '{}',
  shift_name text,
  shift_start timestamptz not null,
  shift_end timestamptz not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('shift_end','manual')),
  first_lat double precision, first_lng double precision, first_in_zone boolean,
  last_lat double precision, last_lng double precision, last_in_zone boolean, last_accuracy_m double precision,
  point_count integer not null default 0,
  out_of_zone_count integer not null default 0,
  check (shift_end > shift_start)
);
create index if not exists live_track_sessions_user_idx on public.live_track_sessions(user_id, started_at desc);
create index if not exists live_track_sessions_open_idx on public.live_track_sessions(shift_end) where ended_at is null;
create index if not exists live_track_sessions_day_idx on public.live_track_sessions(started_at desc);
alter table public.live_track_sessions enable row level security;

create table if not exists public.live_track_points (
  id bigserial primary key,
  session_id uuid not null references public.live_track_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  in_zone boolean,
  zone_sector_id smallint references public.sectors(id) on delete set null
);
create index if not exists live_track_points_session_idx on public.live_track_points(session_id, recorded_at);
create index if not exists live_track_points_time_idx on public.live_track_points(recorded_at);
alter table public.live_track_points enable row level security;

-- ═══════════════ مساعدات ═══════════════
create or replace function app.live_is_viewer() returns boolean language sql stable security definer set search_path = public, app as
$$ select app.has_role(array['ops_room','super_admin']) $$;
revoke all on function app.live_is_viewer() from public, anon;

/** صفة الحساب في البث: متعهد نشط ⇒ contractor؛ وإلا مسؤول قسم بملف ⇒ manager؛ وإلا none */
create or replace function app.live_kind_of(p_user uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when exists (select 1 from public.contractor_profiles cp where cp.user_id = p_user and cp.is_active) then 'contractor'
    when exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.role = 'department_manager')
         and exists (select 1 from public.manager_profiles mp where mp.user_id = p_user) then 'manager'
    else 'none' end
$$;
revoke all on function app.live_kind_of(uuid) from public, anon;

/** مناطق الحساب: المتعهد منطقته؛ المسؤول مناطقه */
create or replace function app.live_sectors_of(p_user uuid) returns smallint[]
language sql stable security definer set search_path = public, app as $$
  select case app.live_kind_of(p_user)
    when 'contractor' then (select array[cp.sector_id] from public.contractor_profiles cp where cp.user_id = p_user and cp.is_active)
    when 'manager' then (select mp.sectors from public.manager_profiles mp where mp.user_id = p_user)
    else '{}'::smallint[] end
$$;
revoke all on function app.live_sectors_of(uuid) from public, anon;

/**
 * نافذة شفت HR الحالية للحساب بتوقيت بغداد (تدعم عبور منتصف الليل):
 *   يعيد صفاً واحداً (shift_name, shift_start, shift_end, within) أو لا شيء إن لم يكن للحساب موظف بشفت.
 *   within = الآن داخل النافذة. إن كان الشفت يعبر منتصف الليل والآن قبل بداية اليوم ⇒ تُجرَّب نافذة الأمس.
 */
create or replace function app.live_shift_window(p_user uuid, p_at timestamptz default now())
returns table(shift_name text, shift_start timestamptz, shift_end timestamptz, within boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare emp uuid; sh record; d date; s timestamptz; e timestamptz;
begin
  select e0.id into emp from public.employees e0 where e0.user_id = p_user and e0.archived_at is null order by e0.created_at limit 1;
  if emp is null then return; end if;
  d := (p_at at time zone 'Asia/Baghdad')::date;
  select * into sh from app.hr_effective_shift(emp, d);
  if sh.shift_id is null then return; end if;
  s := (d::text || ' ' || sh.start_time::text)::timestamp at time zone 'Asia/Baghdad';
  e := (d::text || ' ' || sh.end_time::text)::timestamp at time zone 'Asia/Baghdad';
  if sh.end_time <= sh.start_time then e := e + interval '1 day'; end if;
  if p_at < s and sh.end_time <= sh.start_time then
    -- شفت ليلي بدأ أمس
    s := s - interval '1 day'; e := e - interval '1 day';
  end if;
  shift_name := sh.shift_name; shift_start := s; shift_end := e; within := p_at >= s and p_at < e;
  return next;
end$$;
revoke all on function app.live_shift_window(uuid, timestamptz) from public, anon;

/** داخل زون المنطقة؟ (null إن لم تُعرَّف زونات لأي من مناطق الحساب) + المنطقة المطابقة */
create or replace function app.live_zone_check(p_sectors smallint[], p_lat double precision, p_lng double precision, out in_zone boolean, out zone_sector smallint)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not exists (select 1 from public.gps_geofences g where g.is_active and g.sector_id = any(p_sectors)) then in_zone := null; zone_sector := null; return; end if;
  select g.sector_id into zone_sector from public.gps_geofences g
   where g.is_active and g.sector_id = any(p_sectors) and app.gps_point_in_polygon(p_lat, p_lng, g.polygon) limit 1;
  in_zone := zone_sector is not null;
end$$;
revoke all on function app.live_zone_check(smallint[], double precision, double precision) from public, anon;

/** إنهاء الجلسات التي انتهى شفتها + تنظيف ما تجاوز مدة الاحتفاظ */
create or replace function app.live_housekeeping() returns void
language plpgsql security definer set search_path = public, app as $$
declare keep int := (select retention_days from public.live_track_settings where id = 1);
begin
  update public.live_track_sessions set ended_at = shift_end, end_reason = 'shift_end' where ended_at is null and shift_end <= now();
  delete from public.live_track_points where recorded_at < now() - make_interval(days => keep);
  delete from public.live_track_sessions where started_at < now() - make_interval(days => keep);
end$$;
revoke all on function app.live_housekeeping() from public, anon;

create or replace function app.live_sector_names(p_sectors smallint[]) returns text
language sql stable security definer set search_path = public as
$$ select coalesce(string_agg(s.name, '، ' order by s.sort), '') from public.sectors s where s.id = any(p_sectors) $$;
revoke all on function app.live_sector_names(smallint[]) from public, anon;

-- ═══════════════ واجهة المشارِك (مسؤول القسم / المتعهد) ═══════════════
/** حالة المشاركة للحساب الحالي: هل يُسمح الآن؟ ولماذا لا؟ + الجلسة المفتوحة */
create or replace function public.live_share_status() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare u uuid := auth.uid(); k text; w record; sess public.live_track_sessions; secs smallint[]; iv int;
begin
  if u is null then raise exception 'LIVE_FORBIDDEN'; end if;
  k := app.live_kind_of(u);
  secs := coalesce(app.live_sectors_of(u), '{}');
  select ping_interval_minutes into iv from public.live_track_settings where id = 1;
  select * into w from app.live_shift_window(u);
  select * into sess from public.live_track_sessions s where s.user_id = u and s.ended_at is null and s.shift_end > now() order by s.started_at desc limit 1;
  return jsonb_build_object(
    'kind', k,
    'allowed', k <> 'none' and w.shift_name is not null and coalesce(w.within, false),
    'reason', case when k = 'none' then 'LIVE_NOT_ELIGIBLE' when w.shift_name is null then 'LIVE_NO_SHIFT' when not w.within then 'LIVE_OUTSIDE_SHIFT' else null end,
    'shift_name', w.shift_name, 'shift_start', w.shift_start, 'shift_end', w.shift_end,
    'interval_minutes', iv,
    'sectors', to_jsonb(secs), 'area_names', app.live_sector_names(secs),
    'zone_defined', exists (select 1 from public.gps_geofences g where g.is_active and g.sector_id = any(secs)),
    'active_session_id', sess.id, 'session_started_at', sess.started_at, 'last_seen_at', sess.last_seen_at,
    'point_count', coalesce(sess.point_count, 0), 'last_in_zone', sess.last_in_zone);
end$$;
revoke all on function public.live_share_status() from public, anon;
grant execute on function public.live_share_status() to authenticated;

/** نبضة موقع: تُرفض خارج الشفت؛ تفتح جلسة عند الحاجة؛ تحسب داخل/خارج الزون */
create or replace function public.live_share_ping(p_lat double precision, p_lng double precision, p_accuracy double precision default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); k text; w record; sess public.live_track_sessions; secs smallint[]; z record; iv int;
begin
  if u is null then raise exception 'LIVE_FORBIDDEN'; end if;
  k := app.live_kind_of(u);
  if k = 'none' then raise exception 'LIVE_NOT_ELIGIBLE'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'LIVE_LOCATION_INVALID'; end if;
  select * into w from app.live_shift_window(u);
  if w.shift_name is null then raise exception 'LIVE_NO_SHIFT'; end if;
  if not w.within then raise exception 'LIVE_OUTSIDE_SHIFT'; end if;
  perform app.live_housekeeping();
  secs := coalesce(app.live_sectors_of(u), '{}');
  select * into z from app.live_zone_check(secs, p_lat, p_lng);
  select * into sess from public.live_track_sessions s where s.user_id = u and s.ended_at is null and s.shift_start = w.shift_start order by s.started_at desc limit 1;
  if sess.id is null then
    insert into public.live_track_sessions (user_id, kind, sectors, shift_name, shift_start, shift_end, first_lat, first_lng, first_in_zone)
    values (u, k, secs, w.shift_name, w.shift_start, w.shift_end, p_lat, p_lng, z.in_zone) returning * into sess;
  end if;
  insert into public.live_track_points (session_id, user_id, latitude, longitude, accuracy_m, in_zone, zone_sector_id)
  values (sess.id, u, p_lat, p_lng, p_accuracy, z.in_zone, z.zone_sector);
  update public.live_track_sessions set last_seen_at = now(), last_lat = p_lat, last_lng = p_lng, last_in_zone = z.in_zone, last_accuracy_m = p_accuracy,
         point_count = point_count + 1, out_of_zone_count = out_of_zone_count + case when z.in_zone is false then 1 else 0 end
   where id = sess.id returning * into sess;
  select ping_interval_minutes into iv from public.live_track_settings where id = 1;
  return jsonb_build_object('session_id', sess.id, 'in_zone', z.in_zone, 'zone_sector_id', z.zone_sector, 'shift_end', w.shift_end,
                            'interval_minutes', iv, 'point_count', sess.point_count, 'recorded_at', sess.last_seen_at);
end$$;
revoke all on function public.live_share_ping(double precision, double precision, double precision) from public, anon;
grant execute on function public.live_share_ping(double precision, double precision, double precision) to authenticated;

/** إيقاف المشاركة يدوياً (الجلسة المفتوحة للحساب) */
create or replace function public.live_share_stop() returns boolean
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); n int;
begin
  if u is null then raise exception 'LIVE_FORBIDDEN'; end if;
  update public.live_track_sessions set ended_at = now(), end_reason = 'manual' where user_id = u and ended_at is null;
  get diagnostics n = row_count;
  return n > 0;
end$$;
revoke all on function public.live_share_stop() from public, anon;
grant execute on function public.live_share_stop() to authenticated;

-- ═══════════════ واجهة غرفة العمليات ═══════════════
/** الخريطة الآن: آخر موقع لكل جلسة مفتوحة داخل شفتها */
create or replace function public.live_map_current(p_kind text default null)
returns table(session_id uuid, user_id uuid, kind text, full_name text, sectors smallint[], area_names text, shift_name text, shift_start timestamptz, shift_end timestamptz,
              started_at timestamptz, last_seen_at timestamptz, latitude double precision, longitude double precision, accuracy_m double precision,
              in_zone boolean, point_count integer, out_of_zone_count integer, stale boolean)
language plpgsql security definer set search_path = public, app as $$
declare iv int;
begin
  if not app.live_is_viewer() then raise exception 'LIVE_FORBIDDEN'; end if;
  if p_kind is not null and p_kind not in ('manager','contractor') then raise exception 'LIVE_KIND_INVALID'; end if;
  perform app.live_housekeeping();
  select ping_interval_minutes into iv from public.live_track_settings where id = 1;
  return query
  select s.id, s.user_id, s.kind, app.manager_display_name(s.user_id), s.sectors, app.live_sector_names(s.sectors), s.shift_name, s.shift_start, s.shift_end,
         s.started_at, s.last_seen_at, s.last_lat, s.last_lng, s.last_accuracy_m, s.last_in_zone, s.point_count, s.out_of_zone_count,
         (s.last_seen_at < now() - make_interval(mins => iv * 2 + 2))
  from public.live_track_sessions s
  where s.ended_at is null and s.shift_end > now() and s.last_lat is not null and (p_kind is null or s.kind = p_kind)
  order by s.kind, app.manager_display_name(s.user_id);
end$$;
revoke all on function public.live_map_current(text) from public, anon;
grant execute on function public.live_map_current(text) to authenticated;

/** بيانات الوحدة: جلسات فترة (بتوقيت بغداد) مع أول/آخر موقع وداخل/خارج الزون */
create or replace function public.live_sessions_list(p_from date, p_to date, p_kind text default null, p_user uuid default null)
returns table(session_id uuid, user_id uuid, kind text, full_name text, sectors smallint[], area_names text, manager_name text, shift_name text,
              shift_start timestamptz, shift_end timestamptz, started_at timestamptz, last_seen_at timestamptz, ended_at timestamptz, end_reason text,
              first_lat double precision, first_lng double precision, first_in_zone boolean, last_lat double precision, last_lng double precision, last_in_zone boolean,
              point_count integer, out_of_zone_count integer, duration_minutes integer)
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.live_is_viewer() then raise exception 'LIVE_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'LIVE_RANGE_INVALID'; end if;
  if p_kind is not null and p_kind not in ('manager','contractor') then raise exception 'LIVE_KIND_INVALID'; end if;
  perform app.live_housekeeping();
  return query
  select s.id, s.user_id, s.kind, app.manager_display_name(s.user_id), s.sectors, app.live_sector_names(s.sectors),
         case when s.kind = 'contractor' then (select app.manager_display_name(cp.manager_user_id) from public.contractor_profiles cp where cp.user_id = s.user_id) end,
         s.shift_name, s.shift_start, s.shift_end, s.started_at, s.last_seen_at, s.ended_at, s.end_reason,
         s.first_lat, s.first_lng, s.first_in_zone, s.last_lat, s.last_lng, s.last_in_zone, s.point_count, s.out_of_zone_count,
         (extract(epoch from (coalesce(s.ended_at, least(now(), s.shift_end)) - s.started_at)) / 60)::int
  from public.live_track_sessions s
  where (s.started_at at time zone 'Asia/Baghdad')::date between p_from and p_to
    and (p_kind is null or s.kind = p_kind) and (p_user is null or s.user_id = p_user)
  order by s.started_at desc;
end$$;
revoke all on function public.live_sessions_list(date, date, text, uuid) from public, anon;
grant execute on function public.live_sessions_list(date, date, text, uuid) to authenticated;

/** نقاط جلسة (الخط الزمني/المسار) */
create or replace function public.live_session_points(p_session uuid)
returns table(recorded_at timestamptz, latitude double precision, longitude double precision, accuracy_m double precision, in_zone boolean, zone_sector_id smallint)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.live_is_viewer() then raise exception 'LIVE_FORBIDDEN'; end if;
  return query select p.recorded_at, p.latitude, p.longitude, p.accuracy_m, p.in_zone, p.zone_sector_id
  from public.live_track_points p where p.session_id = p_session order by p.recorded_at;
end$$;
revoke all on function public.live_session_points(uuid) from public, anon;
grant execute on function public.live_session_points(uuid) to authenticated;

-- ═══════════════ الإعدادات (التطوير المركزية) ═══════════════
create or replace function public.live_track_settings_get() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not (app.has_role(array['it_admin','super_admin']) or app.live_is_viewer()) then raise exception 'LIVE_FORBIDDEN'; end if;
  return (select jsonb_build_object('ping_interval_minutes', ping_interval_minutes, 'retention_days', retention_days, 'updated_at', updated_at) from public.live_track_settings where id = 1);
end$$;
revoke all on function public.live_track_settings_get() from public, anon;
grant execute on function public.live_track_settings_get() to authenticated;

create or replace function public.live_track_settings_set(p_interval_minutes integer, p_retention_days integer) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  if p_interval_minutes is null or p_interval_minutes not between 1 and 120 then raise exception 'LIVE_INTERVAL_INVALID'; end if;
  if p_retention_days is null or p_retention_days not between 7 and 3650 then raise exception 'LIVE_RETENTION_INVALID'; end if;
  update public.live_track_settings set ping_interval_minutes = p_interval_minutes, retention_days = p_retention_days, updated_by = auth.uid(), updated_at = now() where id = 1;
  return public.live_track_settings_get();
end$$;
revoke all on function public.live_track_settings_set(integer, integer) from public, anon;
grant execute on function public.live_track_settings_set(integer, integer) to authenticated;
