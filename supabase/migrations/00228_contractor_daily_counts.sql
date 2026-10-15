-- 00228 — الجولة 00258: حضورية عمال المتعهدين بالعدد (ثلاث جهات) بدل قائمة العمال
-- المتعهد: موقع → سلفي → صورة العمال → «العدد» (يشمل نفسه). المتابعة ومسؤول القاطع يكتبان عددهما (جولات لاحقة).
-- غرفة العمليات تعتمد نهاية الشهر جهةً واحدة تسري على كل المتعهدين (جولة لاحقة)؛ المالية تحسب (العدد − 1) × أجر العامل.
-- قائمة العمال وحاضر/غائب أُلغيت: دوالها تُحذف، وجداولها تبقى أرشيفاً للقراءة فقط (لا كتابة جديدة).

-- ═══ 1) الأعداد اليومية الثلاثة ═══
create table if not exists public.contractor_daily_counts (
  id uuid primary key default gen_random_uuid(),
  contractor_user_id uuid not null references public.contractor_profiles(user_id) on delete cascade,
  sector_id smallint not null references public.sectors(id),
  log_date date not null,
  source text not null check (source in ('contractor', 'follow_up', 'sector_manager')),
  headcount int not null check (headcount between 0 and 1000),   -- عند المتعهد يشمل نفسه (≥ 1)
  entered_by uuid not null references auth.users(id),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_by uuid references auth.users(id),      -- تصحيح غرفة العمليات
  edited_at timestamptz,
  edit_reason text,
  unique (contractor_user_id, log_date, source)
);
create index if not exists contractor_daily_counts_date_idx on public.contractor_daily_counts(log_date desc, sector_id);
alter table public.contractor_daily_counts enable row level security;
drop policy if exists "contractor_daily_counts: read" on public.contractor_daily_counts;
create policy "contractor_daily_counts: read" on public.contractor_daily_counts for select to authenticated
  using (contractor_user_id = auth.uid()
      or exists (select 1 from public.contractor_profiles cp where cp.user_id = contractor_user_id and cp.manager_user_id = auth.uid())
      or app.has_role(array['ops_room','admin_ops','finance_officer','it_admin','super_admin']));

-- اعتماد الشهر: جهة واحدة لكل المتعهدين (غرفة العمليات — الجولة اللاحقة تستخدمه)
create table if not exists public.contractor_month_approvals (
  month date primary key check (extract(day from month) = 1),
  approved_source text not null check (approved_source in ('contractor', 'follow_up', 'sector_manager')),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  is_locked boolean not null default true,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopen_reason text
);
alter table public.contractor_month_approvals enable row level security;
drop policy if exists "contractor_month_approvals: read" on public.contractor_month_approvals;
create policy "contractor_month_approvals: read" on public.contractor_month_approvals for select to authenticated
  using (app.has_role(array['ops_room','admin_ops','finance_officer','deputy_director','super_admin']));

-- الشهر مقفل؟ (مُعتمَد ولم يُعَد فتحه)
create or replace function app.contractor_month_locked(p_date date) returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.contractor_month_approvals a where a.month = date_trunc('month', p_date)::date and a.is_locked)
$$;
revoke all on function app.contractor_month_locked(date) from public, anon;

-- كتابة عدد من جهة (مع نافذة اليوم نفسه) — تُستخدم من المتعهد الآن ومن المتابعة/مسؤول القاطع لاحقاً
create or replace function app.contractor_count_upsert(p_contractor uuid, p_date date, p_source text, p_headcount int)
returns public.contractor_daily_counts language plpgsql security definer set search_path = public, app as $$
declare cp public.contractor_profiles; r public.contractor_daily_counts;
begin
  select * into cp from public.contractor_profiles where user_id = p_contractor and is_active;
  if cp.user_id is null then raise exception 'CONTRACTOR_NOT_ASSIGNED'; end if;
  if p_headcount is null or p_headcount < 0 or p_headcount > 1000 then raise exception 'CONTRACTOR_COUNT_INVALID'; end if;
  if p_date <> app.baghdad_today() then raise exception 'CONTRACTOR_COUNT_DAY_CLOSED'; end if;   -- اليوم نفسه فقط؛ ما بعده من غرفة العمليات بسبب
  if app.contractor_month_locked(p_date) then raise exception 'CONTRACTOR_MONTH_LOCKED'; end if;
  insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by)
  values (cp.user_id, cp.sector_id, p_date, p_source, p_headcount, auth.uid())
  on conflict (contractor_user_id, log_date, source) do update set headcount = excluded.headcount, entered_by = auth.uid(), updated_at = now()
  returning * into r;
  insert into public.contractor_audit_log(actor_id, action, contractor_user_id, sector_id, log_date, after_data)
  values (auth.uid(), 'count_' || p_source, cp.user_id, cp.sector_id, p_date, jsonb_build_object('headcount', p_headcount));
  return r;
end$$;
revoke all on function app.contractor_count_upsert(uuid, date, text, int) from public, anon;

-- ═══ 2) إلغاء قائمة العمال وحاضر/غائب (الدوال فقط؛ الجداول أرشيف) ═══
drop function if exists public.contractor_my_workers(date);
drop function if exists public.contractor_add_worker(text, text);
drop function if exists public.contractor_remove_worker(uuid, text);
drop function if exists public.contractor_mark_attendance(uuid, text, date);
drop function if exists public.contractor_mark_all(text, date);
drop function if exists public.contractor_month_grid(date);

-- ═══ 3) إثبات التواجد مع العدد (يستبدل النسخة القديمة ذات 5 معاملات) ═══
drop function if exists public.contractor_checkin(double precision, double precision, double precision, text, text);
create or replace function public.contractor_checkin(p_lat double precision, p_lng double precision, p_accuracy double precision, p_selfie_path text, p_team_photo_path text, p_headcount int)
returns public.contractor_checkins
language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; c public.contractor_checkins; d date := app.baghdad_today();
begin
  p := app.require_contractor();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'CONTRACTOR_LOCATION_REQUIRED'; end if;
  if length(trim(coalesce(p_selfie_path,''))) < 5 then raise exception 'CONTRACTOR_SELFIE_REQUIRED'; end if;
  if length(trim(coalesce(p_team_photo_path,''))) < 5 then raise exception 'CONTRACTOR_TEAM_PHOTO_REQUIRED'; end if;
  if p_headcount is null or p_headcount < 1 or p_headcount > 1000 then raise exception 'CONTRACTOR_COUNT_INVALID'; end if;   -- يشمل المتعهد نفسه
  if exists (select 1 from public.contractor_checkins x where x.contractor_user_id = p.user_id and x.log_date = d) then raise exception 'CONTRACTOR_ALREADY_CHECKED_IN'; end if;
  if app.contractor_month_locked(d) then raise exception 'CONTRACTOR_MONTH_LOCKED'; end if;
  insert into public.contractor_checkins(contractor_user_id, sector_id, log_date, latitude, longitude, accuracy_m, in_zone, selfie_path, team_photo_path, workers_count_at_checkin)
  values (p.user_id, p.sector_id, d, p_lat, p_lng, p_accuracy, app.point_in_sector_zones(p.sector_id, p_lat, p_lng), trim(p_selfie_path), trim(p_team_photo_path), p_headcount)
  returning * into c;
  perform app.contractor_count_upsert(p.user_id, d, 'contractor', p_headcount);
  if c.in_zone is false then
    perform app.support_notify(app.ops_room_users(), 'حضور متعهد خارج نطاق منطقته',
      format('%s سجّل حضوره خارج زونات منطقة %s (العدد %s)', app.manager_display_name(p.user_id), (select name from public.sectors where id = p.sector_id), p_headcount),
      'warning', '/ops-room/contractor-headcounts', c.id, 'contractor_out_of_zone');
  end if;
  return c;
end$$;
revoke all on function public.contractor_checkin(double precision, double precision, double precision, text, text, int) from public, anon;
grant execute on function public.contractor_checkin(double precision, double precision, double precision, text, text, int) to authenticated;

-- تعديل عدد اليوم (بعد الإثبات) حتى نهاية اليوم نفسه
create or replace function public.contractor_set_headcount(p_headcount int)
returns public.contractor_daily_counts language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; d date := app.baghdad_today();
begin
  p := app.require_contractor();
  if not exists (select 1 from public.contractor_checkins c where c.contractor_user_id = p.user_id and c.log_date = d) then raise exception 'CONTRACTOR_CHECKIN_REQUIRED'; end if;
  if p_headcount is null or p_headcount < 1 then raise exception 'CONTRACTOR_COUNT_INVALID'; end if;
  update public.contractor_checkins set workers_count_at_checkin = p_headcount where contractor_user_id = p.user_id and log_date = d;
  return app.contractor_count_upsert(p.user_id, d, 'contractor', p_headcount);
end$$;
revoke all on function public.contractor_set_headcount(int) from public, anon;
grant execute on function public.contractor_set_headcount(int) to authenticated;

-- ═══ 4) ملفي: العدد بدل العمال ═══
drop function if exists public.contractor_me();
create or replace function public.contractor_me()
returns table(user_id uuid, full_name text, manager_user_id uuid, manager_name text, sector_id smallint, area_name text, parent_sector text, shift text,
              today date, checked_in_today boolean, checkin_at timestamptz, in_zone boolean, selfie_path text, team_photo_path text,
              today_headcount int, month_days int, month_headcount_total int, month_locked boolean, zone_defined boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; d date := app.baghdad_today();
begin
  p := app.require_contractor();
  return query
  select p.user_id, app.manager_display_name(p.user_id), p.manager_user_id, app.manager_display_name(p.manager_user_id), p.sector_id, s.name, s.parent_sector, p.shift,
    d, c.id is not null, c.checked_at, c.in_zone, c.selfie_path, c.team_photo_path,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = p.user_id and x.log_date = d and x.source = 'contractor'),
    (select count(*)::int from public.contractor_daily_counts x where x.contractor_user_id = p.user_id and x.source = 'contractor' and x.headcount > 0 and date_trunc('month', x.log_date) = date_trunc('month', d)),
    (select coalesce(sum(x.headcount), 0)::int from public.contractor_daily_counts x where x.contractor_user_id = p.user_id and x.source = 'contractor' and date_trunc('month', x.log_date) = date_trunc('month', d)),
    app.contractor_month_locked(d),
    exists (select 1 from public.gps_geofences g where g.sector_id = p.sector_id and g.is_active)
  from public.sectors s
  left join public.contractor_checkins c on c.contractor_user_id = p.user_id and c.log_date = d
  where s.id = p.sector_id;
end$$;
revoke all on function public.contractor_me() from public, anon;
grant execute on function public.contractor_me() to authenticated;

-- سجل الشهر للمتعهد: يوم × (إثبات؟ العدد، داخل النطاق)
create or replace function public.contractor_my_month(p_month date default null)
returns table(log_date date, checked_in boolean, checkin_at timestamptz, in_zone boolean, headcount int)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  p := app.require_contractor();
  return query
  select g.d::date, c.id is not null, c.checked_at, c.in_zone, x.headcount
  from generate_series(m, least(m + interval '1 month' - interval '1 day', app.baghdad_today()::timestamp), interval '1 day') g(d)
  left join public.contractor_checkins c on c.contractor_user_id = p.user_id and c.log_date = g.d::date
  left join public.contractor_daily_counts x on x.contractor_user_id = p.user_id and x.log_date = g.d::date and x.source = 'contractor'
  order by g.d;
end$$;
revoke all on function public.contractor_my_month(date) from public, anon;
grant execute on function public.contractor_my_month(date) to authenticated;

-- ═══ 5) مسؤول القسم: فريقي = عدد اليوم بدل العمال ═══
drop function if exists public.manager_team_summary();
create or replace function public.manager_team_summary()
returns table(sector_id smallint, area_name text, parent_sector text, contractor_user_id uuid, contractor_name text, contractor_phone text,
              today_headcount int, contractor_checked_in boolean, contractor_checkin_at timestamptz, in_zone boolean,
              vehicles_now int, vehicles jsonb)
language plpgsql stable security definer set search_path = public, app as $$
declare u uuid := auth.uid(); d date := app.baghdad_today();
begin
  if u is null or not app.has_role(array['department_manager','super_admin']) then raise exception 'MANAGER_FORBIDDEN'; end if;
  return query
  select s.id, s.name, s.parent_sector, cp.user_id, app.manager_display_name(cp.user_id), (select e.phone from public.employees e where e.user_id = cp.user_id limit 1),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'contractor'),
    c.id is not null, c.checked_at, c.in_zone,
    (select count(*)::int from public.garage_departures gd where gd.sector_id = s.id and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null),
    coalesce((select jsonb_agg(jsonb_build_object('id', gd.id, 'db_number', v.db_number, 'vehicle_name', v.vehicle_name, 'driver_name', gd.driver_name, 'shift', gd.shift, 'arrived_at', gd.arrived_at, 'trip_status', app.trip_status(gd.id)) order by gd.arrived_at)
              from public.garage_departures gd join public.garage_vehicles v on v.id = gd.vehicle_id
              where gd.sector_id = s.id and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null), '[]'::jsonb)
  from public.manager_profiles mp
  join public.sectors s on s.id = any(mp.sectors)
  left join public.contractor_profiles cp on cp.sector_id = s.id and cp.manager_user_id = mp.user_id and cp.is_active
  left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
  where mp.user_id = u
  order by s.id;
end$$;
revoke all on function public.manager_team_summary() from public, anon;
grant execute on function public.manager_team_summary() to authenticated;

-- ═══ 6) التطوير المركزية: ملف المتعهد بلا عدّاد عمال ═══
drop function if exists public.contractor_profile_for_user(uuid);
create or replace function public.contractor_profile_for_user(p_user_id uuid)
returns table(user_id uuid, manager_user_id uuid, manager_name text, sector_id smallint, area_name text, parent_sector text, shift text, is_active boolean, assigned_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['it_admin','super_admin','ops_room']) then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  return query select cp.user_id, cp.manager_user_id, app.manager_display_name(cp.manager_user_id), cp.sector_id, s.name, s.parent_sector, cp.shift, cp.is_active, cp.assigned_at
  from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.user_id = p_user_id;
end$$;
revoke all on function public.contractor_profile_for_user(uuid) from public, anon;
grant execute on function public.contractor_profile_for_user(uuid) to authenticated;
