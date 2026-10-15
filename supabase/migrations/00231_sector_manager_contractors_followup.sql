-- 00231 · بوابة مسؤول القاطع — وحدة «متابعة المتعهدين والعمال» (00261)
--   · مسؤول القاطع (admin_ops) يرى متعهدي قواطعه: إثبات التواجد (الموقع/الدقة/داخل النطاق/السيلفي/صورة العمال)،
--     عدد المتعهد، عدد المتابعة، ويكتب عدد القاطع (source='sector_manager') — لليوم نفسه فقط ثم يُقفل.
--   · فلاتر: اليوم، المتعهد، القاطع الأم (من نطاقه). سجل شهري لمتعهد واحد.
--   · صلاحية قراءة صور إثبات التواجد لمسؤول القاطع (bucket contractor-photos).

-- ① قراءة صور إثبات التواجد: + admin_ops + follow_up (يرون التواجد في بواباتهم)
drop policy if exists "contractor-photos: read own or ops" on storage.objects;
create policy "contractor-photos: read own or ops" on storage.objects for select to authenticated
  using (bucket_id = 'contractor-photos' and ((storage.foldername(name))[1] = auth.uid()::text
         or app.has_role(array['ops_room','department_manager','admin_ops','follow_up','super_admin'])));

-- ② مناطق قواطع مسؤول القاطع
create or replace function app.sector_manager_area_ids(p_user uuid default auth.uid()) returns smallint[]
language sql stable security definer set search_path = public, app as $$
  select coalesce((select array_agg(s.id order by s.id) from public.sectors s
                   join public.sector_manager_profiles p on p.user_id = p_user
                   where s.parent_sector = any(p.parent_sectors)), '{}'::smallint[])
$$;
revoke all on function app.sector_manager_area_ids(uuid) from public, anon;
grant execute on function app.sector_manager_area_ids(uuid) to authenticated;

-- ③ قائمة المتعهدين ليوم معيّن مع التواجد والأعداد الثلاثة
create or replace function public.sector_manager_contractors(p_date date default null, p_contractor uuid default null, p_parent text default null)
returns table(contractor_user_id uuid, contractor_name text, contractor_phone text, sector_id smallint, area_name text, parent_sector text, shift text,
              department_manager_name text,
              checked_in boolean, checkin_at timestamptz, latitude double precision, longitude double precision, accuracy_m double precision, in_zone boolean,
              selfie_path text, team_photo_path text,
              contractor_headcount int, follow_up_headcount int, my_headcount int, my_updated_at timestamptz, editable boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles; ids smallint[]; d date := coalesce(p_date, app.baghdad_today());
begin
  p := app.require_parent_sector_manager(); ids := app.sector_manager_area_ids(p.user_id);
  if p_parent is not null and not (p_parent = any(p.parent_sectors)) then raise exception 'PARENT_SECTOR_OUT_OF_SCOPE'; end if;
  return query
  select cp.user_id, app.manager_display_name(cp.user_id), (select e.phone from public.employees e where e.user_id = cp.user_id limit 1),
    cp.sector_id, s.name, s.parent_sector, cp.shift,
    app.manager_display_name(cp.manager_user_id),
    c.id is not null, c.checked_at, c.latitude, c.longitude, c.accuracy_m, c.in_zone,
    c.selfie_path, c.team_photo_path,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'contractor'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'follow_up'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'sector_manager'),
    (select x.updated_at from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'sector_manager'),
    d = app.baghdad_today() and not app.contractor_month_locked(d)
  from public.contractor_profiles cp
  join public.sectors s on s.id = cp.sector_id
  left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
  where cp.is_active and cp.sector_id = any(ids)
    and (p_contractor is null or cp.user_id = p_contractor)
    and (p_parent is null or s.parent_sector = p_parent)
  order by s.parent_sector, s.id, cp.user_id;
end$$;

-- ④ كتابة عدد القاطع
create or replace function public.sector_manager_set_headcount(p_contractor uuid, p_headcount int)
returns public.contractor_daily_counts language plpgsql security definer set search_path = public, app as $$
declare p public.sector_manager_profiles; cp public.contractor_profiles;
begin
  p := app.require_parent_sector_manager();
  select * into cp from public.contractor_profiles where user_id = p_contractor and is_active;
  if cp.user_id is null then raise exception 'CONTRACTOR_NOT_ASSIGNED'; end if;
  if not (cp.sector_id = any(app.sector_manager_area_ids(p.user_id))) then raise exception 'CONTRACTOR_OUT_OF_SCOPE'; end if;
  if p_headcount is null or p_headcount < 1 or p_headcount > 500 then raise exception 'CONTRACTOR_COUNT_INVALID'; end if;
  return app.contractor_count_upsert(cp.user_id, app.baghdad_today(), 'sector_manager', p_headcount);
end$$;

-- ⑤ سجل شهري لمتعهد واحد (أيام × تواجد × الأعداد الثلاثة)
create or replace function public.sector_manager_contractor_month(p_contractor uuid, p_month date default null)
returns table(log_date date, checked_in boolean, checkin_at timestamptz, in_zone boolean, selfie_path text, team_photo_path text,
              contractor_headcount int, follow_up_headcount int, admin_ops_headcount int)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles; cp public.contractor_profiles; m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date; last_d date;
begin
  p := app.require_parent_sector_manager();
  select * into cp from public.contractor_profiles where user_id = p_contractor;
  if cp.user_id is null or not (cp.sector_id = any(app.sector_manager_area_ids(p.user_id))) then raise exception 'CONTRACTOR_OUT_OF_SCOPE'; end if;
  last_d := least((m + interval '1 month' - interval '1 day')::date, app.baghdad_today());
  return query
  select g.d::date, c.id is not null, c.checked_at, c.in_zone, c.selfie_path, c.team_photo_path,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = g.d::date and x.source = 'contractor'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = g.d::date and x.source = 'follow_up'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = g.d::date and x.source = 'sector_manager')
  from generate_series(m, last_d, interval '1 day') g(d)
  left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = g.d::date
  order by g.d desc;
end$$;

-- ⑥ ملخص اليوم للرئيسية
create or replace function public.sector_manager_contractors_summary()
returns table(contractors int, checked_in int, out_of_zone int, counted_by_me int, month_locked boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.sector_manager_profiles; ids smallint[]; d date := app.baghdad_today();
begin
  p := app.require_parent_sector_manager(); ids := app.sector_manager_area_ids(p.user_id);
  return query
  select (select count(*)::int from public.contractor_profiles cp where cp.is_active and cp.sector_id = any(ids)),
         (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where c.log_date = d and cp.sector_id = any(ids)),
         (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where c.log_date = d and cp.sector_id = any(ids) and c.in_zone = false),
         (select count(*)::int from public.contractor_daily_counts x join public.contractor_profiles cp on cp.user_id = x.contractor_user_id and cp.is_active where x.log_date = d and x.source = 'sector_manager' and cp.sector_id = any(ids)),
         app.contractor_month_locked(d);
end$$;

revoke all on function
  public.sector_manager_contractors(date, uuid, text),
  public.sector_manager_set_headcount(uuid, int),
  public.sector_manager_contractor_month(uuid, date),
  public.sector_manager_contractors_summary()
from public, anon;
grant execute on function
  public.sector_manager_contractors(date, uuid, text),
  public.sector_manager_set_headcount(uuid, int),
  public.sector_manager_contractor_month(uuid, date),
  public.sector_manager_contractors_summary()
to authenticated;
