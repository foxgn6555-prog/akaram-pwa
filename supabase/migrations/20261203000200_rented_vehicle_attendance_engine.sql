-- 20261203000200 · حضوريات الآليات المؤجرة — المحرّك (مزامنة الانطلاق ⇒ حضور، وكشف الشهر، والإعدادات)
--   · المزامنة تحوّل انطلاقات garage_departures إلى صفوف يوم: انطلاقة واحدة على الأقل ⇒ حاضر، صفر ⇒ غائب.
--   · اليوم بتوقيت بغداد (Asia/Baghdad) كما في فهرس 00075.
--   · المزامنة idempotent: تشغيلها مرتين لا يضاعف شيئاً. لا تحذف يوماً يدوياً (source='manual').
--   · تُستدعى من: فتح وحدة الحضوريات، الاعتماد الشهري، ومهمة cron يومية.

-- ── ① مزامنة يوم واحد ───────────────────────────────────────────────────────
create or replace function app.rented_attendance_sync_day(p_day date)
returns int
language plpgsql volatile security definer set search_path = public, app as $$
declare v_n int := 0; v_today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if p_day is null then raise exception 'RENTED_ATT_DAY_REQUIRED'; end if;
  -- لا نُزامن يوماً لم يحدث: صف الحضور لا معنى له قبل مرور اليوم (الحارس مُطبَّق هنا لا في المستدعي فقط)
  if p_day > v_today then return 0; end if;

  -- ① صفوف الحضور من الانطلاقات: حاضر إن وُجدت انطلاقة، غائب إن وُجد إسناد ولم توجد انطلاقة
  with dep as (
    select d.vehicle_id,
           d.driver_external_id,
           min(d.departed_at) as first_at,
           count(*)::int      as n,
           max(d.shift)       as shift
      from public.garage_departures d
      join public.garage_vehicles  v on v.id = d.vehicle_id
     where v.ownership_type = 'rented'
       and d.driver_external_id is not null
       and (d.departed_at at time zone 'Asia/Baghdad')::date = p_day
     group by d.vehicle_id, d.driver_external_id
  ),
  -- كل (سائق خارجي، آلية مؤجرة) نشط في ذلك اليوم — حتى لو لم ينطلق ⇒ غائب
  assigned as (
    select a.vehicle_id, a.driver_external_id
      from public.garage_vehicle_shift_assignments a
      join public.garage_vehicles v on v.id = a.vehicle_id
     where v.ownership_type = 'rented'
       and a.driver_external_id is not null
       and a.starts_at <  ((p_day + 1)::timestamp at time zone 'Asia/Baghdad')
       and (a.ends_at is null or a.ends_at >= (p_day::timestamp at time zone 'Asia/Baghdad'))
    union
    select d.vehicle_id, d.driver_external_id
      from dep d
  )
  insert into public.rented_attendance_days
         (driver_external_id, vehicle_id, day, shift, status, first_departure_at, departures_count, source)
  select a.driver_external_id,
         a.vehicle_id,
         p_day,
         dep.shift,
         case when coalesce(dep.n, 0) > 0 then 'present' else 'absent' end,
         dep.first_at,
         coalesce(dep.n, 0),
         'sync'
    from assigned a
    left join dep on dep.vehicle_id = a.vehicle_id and dep.driver_external_id = a.driver_external_id
  on conflict (driver_external_id, vehicle_id, day) do update
     set status             = excluded.status,
         first_departure_at = excluded.first_departure_at,
         departures_count   = excluded.departures_count,
         shift              = coalesce(excluded.shift, public.rented_attendance_days.shift),
         updated_at         = now()
   where public.rented_attendance_days.source = 'sync';   -- لا نطمس تعديلاً يدوياً

  get diagnostics v_n = row_count;
  return v_n;
end$$;

-- ── ② مزامنة نطاق أيام (تستخدمها الواجهة عند فتح الشهر) ─────────────────────
create or replace function app.rented_attendance_sync_range(p_from date, p_to date)
returns int
language plpgsql volatile security definer set search_path = public, app as $$
declare v_d date; v_total int := 0; v_cap date;
begin
  if p_from is null or p_to is null then raise exception 'RENTED_ATT_SYNC_RANGE_REQUIRED'; end if;
  if p_to < p_from then raise exception 'RENTED_ATT_SYNC_RANGE_INVALID'; end if;
  if p_to - p_from > 92 then raise exception 'RENTED_ATT_SYNC_RANGE_TOO_WIDE'; end if;
  -- لا نزامن أياماً لم تحدث بعد
  v_cap := least(p_to, (now() at time zone 'Asia/Baghdad')::date);
  v_d := p_from;
  while v_d <= v_cap loop
    v_total := v_total + app.rented_attendance_sync_day(v_d);
    v_d := v_d + 1;
  end loop;
  return v_total;
end$$;

-- ── ③ كشف الشهر: صف لكل سائق × آلية + خريطة الأيام ─────────────────────────
-- الشكل: { month, days_in_month, rows:[{ driver, vehicle, days:{'1':'present'|'absent'|null}, present, absent, tons... }] }
create or replace function app.rented_attendance_month_sheet(p_month date, p_garage text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_first date := date_trunc('month', p_month)::date;
  v_dim   int  := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date - date_trunc('month', p_month)::date + 1;
  v_rows  jsonb;
begin
  select coalesce(jsonb_agg(r order by r->>'driver_name', r->>'db_number'), '[]'::jsonb)
    into v_rows
  from (
    select jsonb_build_object(
      'driver_external_id', x.driver_external_id,
      'driver_name',        x.driver_name,
      'contractor_name',    x.contractor_name,
      'vehicle_id',         x.vehicle_id,
      'db_number',          x.db_number,
      'vehicle_name',       x.vehicle_name,
      'vehicle_category',   x.vehicle_category,
      'garage_parent_sector', x.garage_parent_sector,
      'sector_name',        x.sector_name,
      'present',            x.present,
      'absent',             x.absent,
      'departures_count',   x.departures_count,
      'tons_discharged',    x.tons_discharged,
      'monthly_target_tons', x.monthly_target_tons,
      'tons_per_trip',      x.tons_per_trip,
      'trips_required',     x.trips_required,
      'days',               x.days
    ) as r
    from (
      select a.driver_external_id, a.vehicle_id,
             ed.full_name   as driver_name,
             ed.contractor_name,
             v.db_number    as db_number,
             v.vehicle_name as vehicle_name,
             coalesce(s.vehicle_category, v.vehicle_category) as vehicle_category,
             v.garage_parent_sector,
             sec.name       as sector_name,
             count(*) filter (where a.status = 'present')::int as present,
             count(*) filter (where a.status = 'absent')::int  as absent,
             coalesce(sum(a.departures_count), 0)::int          as departures_count,
             coalesce(sum(a.tons_discharged), 0)               as tons_discharged,
             coalesce(s.monthly_target_tons, 0)                as monthly_target_tons,
             s.tons_per_trip,
             case when s.tons_per_trip is null or s.tons_per_trip = 0 then null
                  else ceil(coalesce(s.monthly_target_tons, 0) / s.tons_per_trip)::int end as trips_required,
             jsonb_object_agg(
               extract(day from a.day)::int::text,
               case when a.status = 'present' then 'present' else 'absent' end
             ) as days
        from public.rented_attendance_days a
        join public.station_external_drivers ed on ed.id = a.driver_external_id
        join public.garage_vehicles v           on v.id  = a.vehicle_id
        left join public.sectors sec            on sec.id = v.sector_id
        left join public.rented_vehicle_discharge_settings s on s.vehicle_id = a.vehicle_id
       where a.day >= v_first
         and a.day <  (v_first + interval '1 month')::date
         and (p_garage is null or v.garage_parent_sector = p_garage)
       group by a.driver_external_id, a.vehicle_id, ed.full_name, ed.contractor_name,
                v.db_number, v.vehicle_name, v.vehicle_category, v.garage_parent_sector,
                sec.name, s.vehicle_category, s.monthly_target_tons, s.tons_per_trip
    ) x
  ) y;

  return jsonb_build_object(
    'month',          to_char(v_first, 'YYYY-MM'),
    'days_in_month',  v_dim,
    'rows',           v_rows
  );
end$$;

-- ── ④ قراءة الشهر محميّة بالدور + المزامنة ─────────────────────────────────
create or replace function public.rented_attendance_month(p_month date default null, p_garage text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_m date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date))::date;
begin
  if not app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin']) then
    raise exception 'RENTED_ATT_FORBIDDEN';
  end if;
  perform app.rented_attendance_sync_range(v_m, least((v_m + interval '1 month')::date - 1, (now() at time zone 'Asia/Baghdad')::date));
  return app.rented_attendance_month_sheet(v_m, p_garage);
end$$;

-- ── ⑤ الكراجات المتاحة للفلتر ───────────────────────────────────────────────
create or replace function public.rented_attendance_garages()
returns table (garage_parent_sector text, vehicles int)
language sql stable security definer set search_path = public, app as $$
  select coalesce(v.garage_parent_sector, '—') as garage_parent_sector, count(*)::int as vehicles
    from public.garage_vehicles v
   where v.ownership_type = 'rented' and v.archived_at is null
     and app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin'])
   group by 1
   order by 1
$$;

-- ── ⑥ عكس الحضور يدوياً (استثناء موثّق بسبب) ────────────────────────────────
create or replace function public.rented_attendance_set_day(
  p_driver_external_id uuid, p_vehicle_id uuid, p_day date,
  p_status text, p_reason text
) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_before jsonb;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'RENTED_ATT_FORBIDDEN'; end if;
  if p_status not in ('present', 'absent') then raise exception 'RENTED_ATT_STATUS_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'RENTED_ATT_REASON_REQUIRED'; end if;

  select to_jsonb(x) into v_before from public.rented_attendance_days x
   where x.driver_external_id = p_driver_external_id and x.vehicle_id = p_vehicle_id and x.day = p_day;

  insert into public.rented_attendance_days
         (driver_external_id, vehicle_id, day, status, departures_count, source, manual_reason, manual_by, manual_at)
  values (p_driver_external_id, p_vehicle_id, p_day, p_status,
          case when p_status = 'present' then 1 else 0 end,
          'manual', trim(p_reason), auth.uid(), now())
  on conflict (driver_external_id, vehicle_id, day) do update
     set status        = excluded.status,
         departures_count = case when excluded.status = 'present'
                                 then greatest(public.rented_attendance_days.departures_count, 1)
                                 else public.rented_attendance_days.departures_count end,
         source        = 'manual',
         manual_reason = excluded.manual_reason,
         manual_by     = auth.uid(),
         manual_at     = now(),
         updated_at    = now();

  insert into public.rented_attendance_audit (entity, entity_id, action, before, after, reason, actor)
  values ('day', p_driver_external_id || ':' || p_vehicle_id || ':' || p_day, 'set_day', v_before,
          jsonb_build_object('status', p_status), trim(p_reason), auth.uid());
end$$;

-- ── ⑦ إعدادات التفريغ ───────────────────────────────────────────────────────
create or replace function public.rented_discharge_save(
  p_vehicle_id uuid, p_tons_per_trip numeric, p_monthly_target_tons numeric, p_note text default null
) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_before jsonb; v_cat text;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'RENTED_ATT_FORBIDDEN'; end if;
  if p_tons_per_trip is not null and p_tons_per_trip <= 0 then raise exception 'RENTED_DISCHARGE_TONS_INVALID'; end if;
  if coalesce(p_monthly_target_tons, 0) < 0 then raise exception 'RENTED_DISCHARGE_TARGET_INVALID'; end if;
  select vehicle_category into v_cat from public.garage_vehicles where id = p_vehicle_id and ownership_type = 'rented';
  if v_cat is null and not exists (select 1 from public.garage_vehicles where id = p_vehicle_id and ownership_type = 'rented') then
    raise exception 'RENTED_VEHICLE_NOT_FOUND';
  end if;

  select to_jsonb(x) into v_before from public.rented_vehicle_discharge_settings x where x.vehicle_id = p_vehicle_id;

  insert into public.rented_vehicle_discharge_settings
         (vehicle_id, vehicle_category, tons_per_trip, monthly_target_tons, note, set_by)
  values (p_vehicle_id, v_cat, p_tons_per_trip, coalesce(p_monthly_target_tons, 0), p_note, auth.uid())
  on conflict (vehicle_id) do update
     set vehicle_category    = excluded.vehicle_category,
         tons_per_trip       = excluded.tons_per_trip,
         monthly_target_tons = excluded.monthly_target_tons,
         note                = excluded.note,
         set_by              = auth.uid(),
         updated_at          = now();

  insert into public.rented_attendance_audit (entity, entity_id, action, before, after, reason, actor)
  values ('discharge', p_vehicle_id::text, 'save', v_before,
          jsonb_build_object('tons_per_trip', p_tons_per_trip, 'monthly_target_tons', p_monthly_target_tons),
          p_note, auth.uid());
end$$;

-- ── ⑧ قراءة إعدادات التفريغ (مع المنطق المحسوب) ────────────────────────────
create or replace function public.rented_discharge_list()
returns table (
  vehicle_id uuid, db_number text, vehicle_name text, vehicle_category text, category_label text,
  min_tons numeric, max_tons numeric, tons_per_trip numeric, monthly_target_tons numeric,
  trips_required int, garage_parent_sector text, note text, set_at timestamptz
)
language sql stable security definer set search_path = public, app as $$
  select v.id, v.db_number, v.vehicle_name,
         coalesce(s.vehicle_category, v.vehicle_category) as vehicle_category,
         vc.label,
         vc.min_tons, vc.max_tons,
         s.tons_per_trip, coalesce(s.monthly_target_tons, 0),
         case when s.tons_per_trip is null or s.tons_per_trip = 0 then null
              else ceil(coalesce(s.monthly_target_tons, 0) / s.tons_per_trip)::int end,
         v.garage_parent_sector, s.note, s.updated_at
    from public.garage_vehicles v
    left join public.rented_vehicle_discharge_settings s on s.vehicle_id = v.id
    left join public.vehicle_categories vc on vc.code = coalesce(s.vehicle_category, v.vehicle_category)
   where v.ownership_type = 'rented' and v.archived_at is null
     and app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin'])
   order by v.garage_parent_sector nulls last, v.db_number
$$;

-- ── ⑨ الضريبة لكل آلية (معاون المدير المفوض حصراً) ─────────────────────────
create or replace function public.rented_tax_save(
  p_vehicle_id uuid, p_mode text, p_amount numeric, p_reason text
) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_before jsonb;
begin
  if not app.has_role(array['deputy_director', 'super_admin']) then raise exception 'RENTED_TAX_FORBIDDEN'; end if;
  if p_mode not in ('fixed', 'percent') then raise exception 'RENTED_TAX_MODE_INVALID'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'RENTED_TAX_AMOUNT_INVALID'; end if;
  if p_mode = 'percent' and p_amount > 100 then raise exception 'RENTED_TAX_PCT_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'RENTED_TAX_REASON_REQUIRED'; end if;
  if not exists (select 1 from public.garage_vehicles where id = p_vehicle_id and ownership_type = 'rented' and archived_at is null) then
    raise exception 'RENTED_VEHICLE_NOT_FOUND';
  end if;

  select to_jsonb(x) into v_before from public.rented_vehicle_taxes x where x.vehicle_id = p_vehicle_id;

  insert into public.rented_vehicle_taxes (vehicle_id, mode, fixed_amount, pct, reason, set_by)
  values (p_vehicle_id, p_mode,
          case when p_mode = 'fixed'   then p_amount end,
          case when p_mode = 'percent' then p_amount end,
          trim(p_reason), auth.uid())
  on conflict (vehicle_id) do update
     set mode         = excluded.mode,
         fixed_amount = excluded.fixed_amount,
         pct          = excluded.pct,
         reason       = excluded.reason,
         set_by       = auth.uid(),
         updated_at   = now();

  insert into public.rented_attendance_audit (entity, entity_id, action, before, after, reason, actor)
  values ('tax', p_vehicle_id::text, 'save', v_before,
          jsonb_build_object('mode', p_mode, 'amount', p_amount), trim(p_reason), auth.uid());
end$$;

-- ── ⑩ إلغاء ضريبة آلية ─────────────────────────────────────────────────────
create or replace function public.rented_tax_clear(p_vehicle_id uuid, p_reason text)
returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_before jsonb;
begin
  if not app.has_role(array['deputy_director', 'super_admin']) then raise exception 'RENTED_TAX_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'RENTED_TAX_REASON_REQUIRED'; end if;
  select to_jsonb(x) into v_before from public.rented_vehicle_taxes x where x.vehicle_id = p_vehicle_id;
  delete from public.rented_vehicle_taxes where vehicle_id = p_vehicle_id;
  insert into public.rented_attendance_audit (entity, entity_id, action, before, after, reason, actor)
  values ('tax', p_vehicle_id::text, 'clear', v_before, null, trim(p_reason), auth.uid());
end$$;

-- ── ⑪ قائمة الضرائب ────────────────────────────────────────────────────────
create or replace function public.rented_tax_list()
returns table (
  vehicle_id uuid, db_number text, vehicle_name text, vehicle_category text,
  driver_name text, contractor_name text, garage_parent_sector text,
  mode text, fixed_amount numeric, pct numeric, reason text, set_at timestamptz, is_set boolean
)
language sql stable security definer set search_path = public, app as $$
  select v.id, v.db_number, v.vehicle_name, v.vehicle_category,
         ed.full_name, ed.contractor_name, v.garage_parent_sector,
         t.mode, t.fixed_amount, t.pct, t.reason, t.updated_at, t.vehicle_id is not null
    from public.garage_vehicles v
    left join public.rented_vehicle_taxes t on t.vehicle_id = v.id
    left join public.station_external_drivers ed on ed.id = v.driver_external_id
   where v.ownership_type = 'rented' and v.archived_at is null
     and app.has_role(array['deputy_director', 'finance_officer', 'executive_director', 'super_admin'])
   order by v.garage_parent_sector nulls last, v.db_number
$$;
