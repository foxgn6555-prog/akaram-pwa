-- ═══════════════════════════════════════════════════════════════
-- 00277 · المحطة التحويلية (٥/٥) — دمج وحدة «النسافات الخارجة» القديمة في الوحدة الموحّدة
--   · النسافة والسكس يُسجَّلان من وحدة واحدة (ts_saksat_records) بفئة الآلية (nasafa / six …)
--   · جدول النسافات القديم ts_trips_records يصبح للقراءة فقط (لا كتابة ولا تعديل من المحطة)
--   · التقرير اليومي: وحدة «النسافات» = سجلات الفئة nasafa من الجدول الموحّد + السجلات القديمة
--   · لا تغيير في مفاتيح التقرير (saksat/trips/carrier) حتى تبقى شاشات المعاون كما هي
-- ═══════════════════════════════════════════════════════════════

-- ── ① الجدول القديم للقراءة فقط ──
drop policy if exists "ts_trips: كتابة المحطة" on public.ts_trips_records;
drop policy if exists "ts_trips: تعديل المحطة" on public.ts_trips_records;
comment on table public.ts_trips_records is
  '00332: جدول قديم للقراءة فقط — النسافات الخارجة تُسجَّل الآن في ts_saksat_records بفئة nasafa';

update public.ts_unit_capacities set label = 'السكسات الخارجة' where unit = 'saksat';
update public.ts_unit_capacities set label = 'النسافات الخارجة' where unit = 'trips';

-- ── ② التقرير اليومي — النسافات من الجدول الموحّد + القديم ──
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

  -- 00332: السكسات والنسافات في جدول موحّد (ts_saksat_records) — التمييز بفئة الآلية؛
  --        سجلات جدول النسافات القديم (ts_trips_records) تُحسب معها حتى لا تضيع.
  select jsonb_build_object(
    'saksat', (select jsonb_build_object(
        'count', count(r.id),
        'capacity', c.capacity_tons,
        'tons', coalesce(sum(case when r.id is not null then coalesce(r.weight_tons, c.capacity_tons) end), 0))
      from public.ts_unit_capacities c
      left join public.ts_saksat_records r
        on r.log_date = p_day and r.archived_at is null and coalesce(r.vehicle_category, '') <> 'nasafa'
      where c.unit = 'saksat'
      group by c.capacity_tons),
    'trips', (select jsonb_build_object(
        'count', count(r.id),
        'capacity', c.capacity_tons,
        'tons', coalesce(sum(case when r.id is not null then coalesce(r.weight_tons, c.capacity_tons) end), 0))
      from public.ts_unit_capacities c
      left join (
        select s.id, s.weight_tons from public.ts_saksat_records s
         where s.log_date = p_day and s.archived_at is null and s.vehicle_category = 'nasafa'
        union all
        select t.id, t.weight_tons from public.ts_trips_records t
         where t.log_date = p_day and t.archived_at is null
      ) r on true
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
