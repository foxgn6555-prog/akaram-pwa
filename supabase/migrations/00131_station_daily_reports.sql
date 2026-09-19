-- ═══════════════════════════════════════════════════════════════
-- 00131 · التقارير اليومية والمحاسبة الوزنية بين المحطة والعمليات والمعاون
--   · ts_unit_capacities: الحمولة القياسية للشحنة الخارجة:
--     سكسات 10 طن · نسافات 25 طن · ناقلة حاويات مكبسية 16 طن
--   · ops_station_daily_report(p_day): التقرير اليومي الكامل:
--     تفاصيل الأوزان الداخلة · مجاميع الداخلة حسب الوجهة (مكبس/محطة)
--     · موقف الصادرات (عدد الشحنات والأطنان لكل وحدة) · المخالفات
--   · ops_sector_tonnage(from,to): أطنان كل قاطع (كرادة/زعفرانية…)
--   · deputy_daily_reports + ops_send_daily_to_deputy: بعد تدقيق غرفة
--     العمليات يُرسل التقرير يومياً لبوابة معاون المدير المفوض
-- ═══════════════════════════════════════════════════════════════

-- ── ① الحمولات القياسية للشحنات الخارجة ──
create table if not exists public.ts_unit_capacities (
  unit          text primary key check (unit in ('saksat','trips','carrier')),
  label         text not null,
  capacity_tons numeric(6,2) not null check (capacity_tons > 0)
);

insert into public.ts_unit_capacities (unit, label, capacity_tons) values
  ('saksat',  'السكسات الخارجة',        10),
  ('trips',   'النسافات الخارجة',        25),
  ('carrier', 'ناقلة حاويات مكبسية',     16)
on conflict (unit) do update
  set label = excluded.label, capacity_tons = excluded.capacity_tons;

alter table public.ts_unit_capacities enable row level security;
drop policy if exists "ts_caps: قراءة للعموم المصادق" on public.ts_unit_capacities;
create policy "ts_caps: قراءة للعموم المصادق" on public.ts_unit_capacities
  for select to authenticated using (true);
drop policy if exists "ts_caps: منع الكتابة" on public.ts_unit_capacities;
create policy "ts_caps: منع الكتابة" on public.ts_unit_capacities
  for insert to authenticated with check (false);

-- ── ② التقرير اليومي الكامل للمحطة (غرفة_operations/المحطة/المعاون) ──
create or replace function app.ops_station_daily_report(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_inbound jsonb; v_totals jsonb; v_outbound jsonb; v_violations jsonb;
begin
  if not app.has_role(array['ops_room','transfer_station','deputy_director','super_admin']) then
    raise exception 'OPS_DAILY_FORBIDDEN';
  end if;
  if p_day is null then raise exception 'OPS_DAY_REQUIRED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'db_number', w.db_number, 'vehicle_name', w.vehicle_name, 'driver_name', w.driver_name,
      'shift', w.shift, 'area_name', w.area_name, 'manager_name', w.manager_name,
      'weight_tons', w.weight_tons, 'destination', w.destination,
      'destination_label', w.destination_label, 'kind_label', w.kind_label,
      'min_tons', w.min_tons, 'violation', w.violation, 'deficit_tons', w.deficit_tons,
      'arrived_at', w.arrived_at, 'weighed_at', w.weighed_at, 'completed_at', w.completed_at,
      'transit_minutes', w.transit_minutes, 'weigh_wait_minutes', w.weigh_wait_minutes,
      'process_minutes', w.process_minutes
    ) order by w.weighed_at), '[]'::jsonb)
    into v_inbound
  from app.ops_station_workflow(p_day, null) w
  where w.completed_at is not null;

  select jsonb_build_object(
    'press', jsonb_build_object(
      'count', count(*) filter (where w.destination = 'press'),
      'tons', coalesce(sum(w.weight_tons) filter (where w.destination = 'press'), 0)),
    'transfer_station', jsonb_build_object(
      'count', count(*) filter (where w.destination = 'transfer_station'),
      'tons', coalesce(sum(w.weight_tons) filter (where w.destination = 'transfer_station'), 0)),
    'total_count', count(*),
    'total_tons', coalesce(sum(w.weight_tons), 0))
    into v_totals
  from app.ops_station_workflow(p_day, null) w
  where w.completed_at is not null;

  select jsonb_build_object(
    'saksat', (select jsonb_build_object(
        'count', count(r.id),
        'capacity', c.capacity_tons,
        'tons', coalesce(sum(case when r.id is not null then coalesce(r.weight_tons, c.capacity_tons) end), 0))
      from public.ts_unit_capacities c
      left join public.ts_saksat_records r on r.log_date = p_day and r.archived_at is null
      where c.unit = 'saksat'
      group by c.capacity_tons),
    'trips', (select jsonb_build_object(
        'count', count(r.id),
        'capacity', c.capacity_tons,
        'tons', coalesce(sum(case when r.id is not null then coalesce(r.weight_tons, c.capacity_tons) end), 0))
      from public.ts_unit_capacities c
      left join public.ts_trips_records r on r.log_date = p_day and r.archived_at is null
      where c.unit = 'trips'
      group by c.capacity_tons),
    'carrier', (select jsonb_build_object(
        'count', count(r.id),
        'capacity', c.capacity_tons,
        'tons', coalesce(sum(case when r.id is not null then coalesce(r.weight_tons, c.capacity_tons) end), 0))
      from public.ts_unit_capacities c
      left join public.ts_carrier_records r on r.log_date = p_day and r.archived_at is null
      where c.unit = 'carrier'
      group by c.capacity_tons))
    into v_outbound;

  select coalesce(jsonb_agg(jsonb_build_object(
      'driver_name', v.driver_name, 'db_number', v.db_number, 'kind_label', k.label,
      'weight_tons', v.weight_tons, 'min_tons', v.min_tons, 'deficit_tons', v.deficit_tons,
      'violated_at', v.violated_at) order by v.violated_at), '[]'::jsonb)
    into v_violations
  from public.ts_violations v
  left join public.ts_vehicle_kinds k on k.kind = v.vehicle_kind
  where (v.violated_at at time zone 'Asia/Baghdad')::date = p_day;

  return jsonb_build_object(
    'day', p_day,
    'inbound', v_inbound,
    'inbound_totals', v_totals,
    'outbound', v_outbound || jsonb_build_object(
      'total_count', coalesce((v_outbound->'saksat'->>'count')::int, 0)
                   + coalesce((v_outbound->'trips'->>'count')::int, 0)
                   + coalesce((v_outbound->'carrier'->>'count')::int, 0),
      'total_tons', coalesce((v_outbound->'saksat'->>'tons')::numeric, 0)
                  + coalesce((v_outbound->'trips'->>'tons')::numeric, 0)
                  + coalesce((v_outbound->'carrier'->>'tons')::numeric, 0)),
    'violations', v_violations);
end$$;

-- ── ③ أطنان القواطع (كم طن خرج من الكرادة/الزعفرانية…) ──
create or replace function app.ops_sector_tonnage(p_from date, p_to date)
returns table (
  parent_sector text, inbound_count bigint, inbound_tons numeric,
  press_tons numeric, station_tons numeric, violation_count bigint
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','transfer_station','deputy_director','super_admin']) then
    raise exception 'OPS_SECTOR_FORBIDDEN';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'OPS_SECTOR_RANGE_INVALID';
  end if;
  return query
  select s.parent_sector,
         count(*) filter (where st.completed_at is not null),
         coalesce(sum(st.weight_tons), 0),
         coalesce(sum(st.weight_tons) filter (where st.destination = 'press'), 0),
         coalesce(sum(st.weight_tons) filter (where st.destination = 'transfer_station'), 0),
         count(*) filter (where st.violation)
  from public.vehicle_trip_legs i
  join public.garage_departures d on d.id = i.departure_id
  join public.sectors s on s.id = d.sector_id
  left join public.ts_visit_weighing_steps st on st.visit_leg_id = i.id
  where i.destination_type = 'transfer_station'
    and (i.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
  group by s.parent_sector
  order by inbound_tons desc;
end$$;

-- ── ④ الإرسال اليومي من غرفة العمليات إلى معاون المدير ──
create table if not exists public.deputy_daily_reports (
  id         uuid primary key default gen_random_uuid(),
  report_day date not null unique,
  payload    jsonb not null,
  note       text,
  sent_by    uuid references auth.users (id),
  sent_at    timestamptz not null default now()
);

alter table public.deputy_daily_reports enable row level security;
drop policy if exists "deputy_daily: قراءة المعاون والعمليات" on public.deputy_daily_reports;
create policy "deputy_daily: قراءة المعاون والعمليات" on public.deputy_daily_reports
  for select to authenticated
  using (app.has_role(array['deputy_director','ops_room','executive_director','super_admin']));
drop policy if exists "deputy_daily: منع الكتابة المباشرة" on public.deputy_daily_reports;
create policy "deputy_daily: منع الكتابة المباشرة" on public.deputy_daily_reports
  for insert to authenticated with check (false);
drop policy if exists "deputy_daily: منع الحذف" on public.deputy_daily_reports;
create policy "deputy_daily: منع الحذف" on public.deputy_daily_reports
  for delete to authenticated using (false);

create or replace function app.ops_send_daily_to_deputy(p_day date, p_note text default null)
returns public.deputy_daily_reports
language plpgsql security definer set search_path = public, app as $$
declare
  u uuid := auth.uid();
  payload jsonb;
  rec public.deputy_daily_reports;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then
    raise exception 'OPS_SEND_FORBIDDEN';
  end if;
  payload := app.ops_station_daily_report(p_day);
  insert into public.deputy_daily_reports (report_day, payload, note, sent_by)
  values (p_day, payload, nullif(trim(coalesce(p_note, '')), ''), u)
  on conflict (report_day) do update
    set payload = excluded.payload, note = excluded.note,
        sent_by = excluded.sent_by, sent_at = now()
  returning * into rec;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('deputy_daily_reports', rec.id::text, 'UPDATE',
          jsonb_build_object('day', p_day), u, app.current_role());
  perform app.notify_by_role(
    array['deputy_director','super_admin'],
    'التقرير اليومي للمحطة التحويلية',
    format('أرسلت غرفة العمليات تقرير المحطة ليوم %s بعد التدقيق للاطلاع والتحليل.', p_day),
    'info', '/deputy/data-analysis');
  return rec;
end$$;

create or replace function app.deputy_daily_reports_list(p_limit integer default 60)
returns table (report_day date, sent_at timestamptz, sender_name text, note text, payload jsonb)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['deputy_director','ops_room','executive_director','super_admin']) then
    raise exception 'DEPUTY_DAILY_FORBIDDEN';
  end if;
  if p_limit not between 1 and 366 then raise exception 'DEPUTY_DAILY_LIMIT_INVALID'; end if;
  return query
  select r.report_day, r.sent_at,
         coalesce(nullif(e.full_name, ''), u.email, r.sent_by::text),
         r.note, r.payload
  from public.deputy_daily_reports r
  left join public.employees e on e.user_id = r.sent_by
  left join auth.users u on u.id = r.sent_by
  order by r.report_day desc
  limit p_limit;
end$$;

-- ── ⑤ أغلفة public ──
create or replace function public.ops_station_daily_report(p_day date)
returns jsonb language sql stable security invoker set search_path = public, app as $$
  select app.ops_station_daily_report(p_day)
$$;
create or replace function public.ops_sector_tonnage(p_from date, p_to date)
returns table (
  parent_sector text, inbound_count bigint, inbound_tons numeric,
  press_tons numeric, station_tons numeric, violation_count bigint
)
language sql stable security invoker set search_path = public, app as $$
  select * from app.ops_sector_tonnage(p_from, p_to)
$$;
create or replace function public.ops_send_daily_to_deputy(p_day date, p_note text default null)
returns public.deputy_daily_reports language sql security invoker set search_path = public, app as $$
  select app.ops_send_daily_to_deputy(p_day, p_note)
$$;
create or replace function public.deputy_daily_reports_list(p_limit integer default 60)
returns table (report_day date, sent_at timestamptz, sender_name text, note text, payload jsonb)
language sql stable security invoker set search_path = public, app as $$
  select * from app.deputy_daily_reports_list(p_limit)
$$;

-- ── ⑥ الصلاحيات ──
revoke all on function
  app.ops_station_daily_report(date), app.ops_sector_tonnage(date, date),
  app.ops_send_daily_to_deputy(date, text), app.deputy_daily_reports_list(integer),
  public.ops_station_daily_report(date), public.ops_sector_tonnage(date, date),
  public.ops_send_daily_to_deputy(date, text), public.deputy_daily_reports_list(integer)
  from public, anon, authenticated;
grant execute on function
  app.ops_station_daily_report(date), app.ops_sector_tonnage(date, date),
  app.ops_send_daily_to_deputy(date, text), app.deputy_daily_reports_list(integer),
  public.ops_station_daily_report(date), public.ops_sector_tonnage(date, date),
  public.ops_send_daily_to_deputy(date, text), public.deputy_daily_reports_list(integer)
  to authenticated;
