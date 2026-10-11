-- 00204 (جولة 00217): exec_overview — أسماء أنواع المخالفات في الكشوفات تصل بالعربية من جدول disclosure_types
-- (كانت تصل بالمفتاح التقني مثل negligence فتظهر للمدير المفوض كما هي). لا تغيير آخر في الدالة.
create or replace function public.exec_overview(
  p_from date, p_to date, p_sector smallint default null, p_shift text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  f timestamptz; t timestamptz; v_days int;
  j_work jsonb; j_comp jsonb; j_fleet jsonb; j_station jsonb; j_disc jsonb; j_media jsonb; j_gbs jsonb; j_sup jsonb; j_fin jsonb;
  v_sector_name text; v_parent text;
  v_pay record; v_pay_month date;
begin
  if not app.is_executive() then raise exception 'EXEC_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'EXEC_RANGE_INVALID'; end if;
  if p_to - p_from > 400 then raise exception 'EXEC_RANGE_TOO_WIDE'; end if;
  f := p_from::timestamptz; t := (p_to + 1)::timestamptz; v_days := p_to - p_from + 1;
  if p_sector is not null then select s.name, s.parent_sector into v_sector_name, v_parent from public.sectors s where s.id = p_sector; end if;
  -- ملاحظة: الشكاوى والكشوفات تُسجَّل على مستوى القطاع الأم (karrada/zaafaraniya) فيُطبَّق فلتر القاطع عليها عبر قطاعه الأم

  -- ── القوى العاملة والحضور ──
  select jsonb_build_object(
    'active',      (select count(*) from public.employees e where e.employment_status = 'active' and e.archived_at is null),
    'hired',       (select count(*) from public.employees e where e.hire_date between p_from and p_to and e.archived_at is null),
    'terminated',  (select count(*) from public.employees e where e.terminated_at between p_from and p_to),
    'by_department', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.c) order by x.c desc) from (
        select coalesce(d.name, 'بدون قسم') as name, count(*) as c from public.employees e left join public.departments d on d.id = e.department_id
        where e.employment_status = 'active' and e.archived_at is null group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'attendance', (select jsonb_build_object(
        'present',    count(*) filter (where a.status = 'present'),
        'late',       count(*) filter (where a.status = 'late'),
        'absent',     count(*) filter (where a.status = 'absent'),
        'incomplete', count(*) filter (where a.status = 'incomplete'),
        'leave',      count(*) filter (where a.status in ('leave', 'time_permit')),
        'shortfall_minutes', coalesce(sum(a.shortfall_minutes), 0),
        'overtime_minutes',  coalesce(sum(a.overtime_minutes), 0),
        'deduction_days',    coalesce(sum(a.proposed_deduction_days) filter (where not coalesce(a.deduction_waived, false)), 0))
       from public.hr_attendance_days a where a.work_date between p_from and p_to and not a.is_rest_day),
    'attendance_series', coalesce((select jsonb_agg(jsonb_build_object('d', x.d, 'present', x.p, 'absent', x.ab, 'late', x.l) order by x.d) from (
        select a.work_date as d, count(*) filter (where a.status in ('present', 'late', 'time_permit')) as p,
               count(*) filter (where a.status = 'absent') as ab, count(*) filter (where a.status = 'late') as l
        from public.hr_attendance_days a where a.work_date between p_from and p_to and not a.is_rest_day group by 1) x), '[]'::jsonb),
    'leaves', (select jsonb_build_object(
        'pending',  count(*) filter (where l.status = 'pending'),
        'approved', count(*) filter (where l.status = 'approved'),
        'rejected', count(*) filter (where l.status = 'rejected'),
        'days',     coalesce(sum(l.days) filter (where l.status = 'approved' and l.kind = 'leave'), 0))
       from public.hr_leaves l where l.start_date between p_from and p_to),
    'alerts', (select count(*) from public.hr_alerts al where al.period_month between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date)
  ) into j_work;

  -- ── الشكاوى ──
  select jsonb_build_object(
    'total', count(*),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'count', x.c) order by x.c desc) from (
        select c2.status as k, count(*) as c from public.complaints c2 where c2.received_at >= f and c2.received_at < t
          and (v_parent is null or c2.sector = v_parent) group by 1) x), '[]'::jsonb),
    'by_sector', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce(c2.sector, 'غير محدد') as k, count(*) as c from public.complaints c2 where c2.received_at >= f and c2.received_at < t
          and (v_parent is null or c2.sector = v_parent) group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce(c2.complaint_type, 'غير مصنف') as k, count(*) as c from public.complaints c2 where c2.received_at >= f and c2.received_at < t
          and (v_parent is null or c2.sector = v_parent) group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d', x.d, 'count', x.c) order by x.d) from (
        select (c2.received_at at time zone 'Asia/Baghdad')::date as d, count(*) as c from public.complaints c2 where c2.received_at >= f and c2.received_at < t
          and (v_parent is null or c2.sector = v_parent) group by 1) x), '[]'::jsonb),
    'resolved', count(*) filter (where c.status in ('sent', 'archived')),
    'open',     count(*) filter (where c.status not in ('sent', 'archived'))
  ) into j_comp from public.complaints c where c.received_at >= f and c.received_at < t and (v_parent is null or c.sector = v_parent);

  -- ── الأسطول والانطلاقات والصيانة ──
  select jsonb_build_object(
    'vehicles', (select count(*) from public.garage_vehicles v where v.archived_at is null and (p_sector is null or v.sector_id = p_sector) and (p_shift is null or v.shift = p_shift)),
    'departures', count(*),
    'returned', count(*) filter (where g.returned_at is not null),
    'open_now', (select count(*) from public.garage_departures g2 where g2.returned_at is null and (p_sector is null or g2.sector_id = p_sector) and (p_shift is null or g2.shift = p_shift)),
    'avg_hours', round(coalesce(avg(extract(epoch from (g.returned_at - g.departed_at)) / 3600) filter (where g.returned_at is not null), 0)::numeric, 1),
    'by_shift', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce(g2.shift, 'غير محدد') as k, count(*) as c from public.garage_departures g2 where g2.departed_at >= f and g2.departed_at < t
          and (p_sector is null or g2.sector_id = p_sector) and (p_shift is null or g2.shift = p_shift) group by 1) x), '[]'::jsonb),
    'by_sector', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce(s.name, 'غير محدد') as k, count(*) as c from public.garage_departures g2 left join public.sectors s on s.id = g2.sector_id
          where g2.departed_at >= f and g2.departed_at < t and (p_sector is null or g2.sector_id = p_sector) and (p_shift is null or g2.shift = p_shift)
          group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d', x.d, 'count', x.c) order by x.d) from (
        select (g2.departed_at at time zone 'Asia/Baghdad')::date as d, count(*) as c from public.garage_departures g2 where g2.departed_at >= f and g2.departed_at < t
          and (p_sector is null or g2.sector_id = p_sector) and (p_shift is null or g2.shift = p_shift) group by 1) x), '[]'::jsonb),
    'breakdowns', (select count(*) from public.sector_breakdowns b where b.created_at >= f and b.created_at < t and b.archived_at is null
          and (p_sector is null or p_sector = any(b.sectors)) and (p_shift is null or b.shift = p_shift)),
    'maintenance', (select jsonb_build_object(
        'opened',   count(*) filter (where m.reported_at >= f and m.reported_at < t),
        'closed',   count(*) filter (where m.completed_at >= f and m.completed_at < t),
        'open_now', count(*) filter (where m.completed_at is null and m.status not in ('cancelled', 'returned_to_work', 'closed_at_garage')),
        'avg_hours', round(coalesce(avg(extract(epoch from (m.ready_at - m.reported_at)) / 3600) filter (where m.ready_at is not null and m.reported_at >= f and m.reported_at < t), 0)::numeric, 1),
        'cost', coalesce(sum(coalesce(m.actual_cost, 0) + coalesce(m.parts_actual_cost, 0) + coalesce(m.service_cost, 0)) filter (where m.reported_at >= f and m.reported_at < t), 0),
        'by_fault', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
            select coalesce(m2.fault_type, 'غير محدد') as k, count(*) as c from public.vehicle_maintenance_cases m2 where m2.reported_at >= f and m2.reported_at < t group by 1 order by 2 desc limit 8) x), '[]'::jsonb))
       from public.vehicle_maintenance_cases m),
    'gps_alerts', (select count(*) from public.gps_operational_alerts ga where ga.opened_at >= f and ga.opened_at < t)
  ) into j_fleet from public.garage_departures g where g.departed_at >= f and g.departed_at < t
    and (p_sector is null or g.sector_id = p_sector) and (p_shift is null or g.shift = p_shift);

  -- ── المحطة التحويلية ──
  select jsonb_build_object(
    'weighings', count(*),
    'tons', coalesce(sum(w.weight_tons), 0),
    'violations', count(*) filter (where w.violation),
    'deficit_tons', coalesce(sum(w.deficit_tons) filter (where w.violation), 0),
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c, 'tons', x.tn) order by x.tn desc) from (
        select coalesce(vk.label, w2.vehicle_kind, 'غير محدد') as k, count(*) as c, coalesce(sum(w2.weight_tons), 0) as tn from public.ts_visit_weighing_steps w2
          left join public.ts_vehicle_kinds vk on vk.kind = w2.vehicle_kind where w2.weighed_at >= f and w2.weighed_at < t group by 1) x), '[]'::jsonb),
    'by_destination', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c, 'tons', x.tn) order by x.tn desc) from (
        select case w2.destination when 'press' then 'الكبس' when 'transfer_station' then 'المحطة التحويلية' else coalesce(w2.destination, 'غير محدد') end as k, count(*) as c, coalesce(sum(w2.weight_tons), 0) as tn from public.ts_visit_weighing_steps w2
          where w2.weighed_at >= f and w2.weighed_at < t group by 1) x), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d', x.d, 'count', x.c, 'tons', x.tn) order by x.d) from (
        select (w2.weighed_at at time zone 'Asia/Baghdad')::date as d, count(*) as c, coalesce(sum(w2.weight_tons), 0) as tn from public.ts_visit_weighing_steps w2
          where w2.weighed_at >= f and w2.weighed_at < t group by 1) x), '[]'::jsonb),
    'top_violators', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c, 'deficit', x.df) order by x.c desc) from (
        select coalesce(v2.driver_name, 'غير معروف') || coalesce(' · ' || v2.db_number, '') as k, count(*) as c, coalesce(sum(v2.deficit_tons), 0) as df
          from public.ts_violations v2 where v2.violated_at >= f and v2.violated_at < t group by 1 order by 2 desc limit 8) x), '[]'::jsonb)
  ) into j_station from public.ts_visit_weighing_steps w where w.weighed_at >= f and w.weighed_at < t;

  -- ── الكشوفات (المخالفات الميدانية) ──
  select jsonb_build_object(
    'total', count(*),
    'by_violation', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce((select t.label from public.disclosure_types t where t.key = d2.violation_type), d2.violation_type, 'غير محدد') as k, count(*) as c from public.disclosures d2 where d2.log_date between p_from and p_to and d2.archived_at is null
          and (v_parent is null or d2.sector = v_parent) and (p_shift is null or d2.shift = p_shift) group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'count', x.c) order by x.c desc) from (
        select d2.status as k, count(*) as c from public.disclosures d2 where d2.log_date between p_from and p_to and d2.archived_at is null
          and (v_parent is null or d2.sector = v_parent) and (p_shift is null or d2.shift = p_shift) group by 1) x), '[]'::jsonb),
    'by_contractor', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce(d2.contractor_name, 'غير محدد') as k, count(*) as c from public.disclosures d2 where d2.log_date between p_from and p_to and d2.archived_at is null
          and (v_parent is null or d2.sector = v_parent) and (p_shift is null or d2.shift = p_shift) group by 1 order by 2 desc limit 8) x), '[]'::jsonb)
  ) into j_disc from public.disclosures d where d.log_date between p_from and p_to and d.archived_at is null
    and (v_parent is null or d.sector = v_parent) and (p_shift is null or d.shift = p_shift);

  -- ── الإعلام ──
  select jsonb_build_object(
    'submissions', count(*),
    'photos', coalesce(sum(ms.photo_count), 0),
    'by_work_type', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c) order by x.c desc) from (
        select coalesce(m2.work_type, 'غير محدد') as k, count(*) as c from public.media_submissions m2 where m2.event_date between p_from and p_to and m2.archived_at is null
          and (p_sector is null or p_sector = any(m2.sector_ids)) group by 1 order by 2 desc limit 10) x), '[]'::jsonb)
  ) into j_media from public.media_submissions ms where ms.event_date between p_from and p_to and ms.archived_at is null and (p_sector is null or p_sector = any(ms.sector_ids));

  -- ── حاويات GBS ──
  select jsonb_build_object(
    'total', count(*),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'count', x.c) order by x.c desc) from (
        select g2.status as k, count(*) as c from public.gbs_containers g2 where (p_sector is null or g2.sector_id = p_sector) group by 1) x), '[]'::jsonb),
    'updates', (select count(*) from public.gbs_container_updates u where u.created_at >= f and u.created_at < t)
  ) into j_gbs from public.gbs_containers gc where (p_sector is null or gc.sector_id = p_sector);

  -- ── تجهيزات القواطع ──
  select jsonb_build_object(
    'total', count(*),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', x.k, 'count', x.c) order by x.c desc) from (
        select r2.status as k, count(*) as c from public.sector_supply_requests r2 where r2.created_at >= f and r2.created_at < t and r2.archived_at is null
          and (p_sector is null or p_sector = any(r2.sectors)) group by 1) x), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'count', x.c, 'qty', x.q) order by x.c desc) from (
        select coalesce(r2.supply_type, 'غير محدد') as k, count(*) as c, coalesce(sum(r2.quantity), 0) as q from public.sector_supply_requests r2
          where r2.created_at >= f and r2.created_at < t and r2.archived_at is null and (p_sector is null or p_sector = any(r2.sectors)) group by 1 order by 2 desc limit 10) x), '[]'::jsonb)
  ) into j_sup from public.sector_supply_requests r where r.created_at >= f and r.created_at < t and r.archived_at is null and (p_sector is null or p_sector = any(r.sectors));

  -- ── المالية (أرقام إجمالية فقط — التفاصيل الفردية تبقى في بوابة المالية) ──
  v_pay_month := date_trunc('month', p_to)::date;
  select x.* into v_pay from (
    select me.period_month, me.status, me.rows_count,
           coalesce(sum(mr.proposed_net), 0) as proposed_total, coalesce(sum(coalesce(mr.final_net, mr.proposed_net)), 0) as final_total,
           coalesce(sum(mr.ops_deduction_amount), 0) as deductions_total, coalesce(sum(mr.allowances_total), 0) as allowances_total
    from public.hr_month_exports me left join public.hr_month_export_rows mr on mr.export_id = me.id
    where me.period_month <= v_pay_month and me.status in ('exported', 'approved')
    group by me.id, me.period_month, me.status, me.rows_count, me.version order by me.period_month desc, me.version desc limit 1) x;
  select jsonb_build_object(
    'payroll', case when v_pay.period_month is null then null else jsonb_build_object(
        'month', v_pay.period_month, 'status', v_pay.status, 'employees', v_pay.rows_count,
        'proposed_total', v_pay.proposed_total, 'final_total', v_pay.final_total,
        'deductions_total', v_pay.deductions_total, 'allowances_total', v_pay.allowances_total) end,
    'payroll_months', coalesce((select jsonb_agg(jsonb_build_object('month', x.m, 'status', x.st, 'total', x.tot) order by x.m) from (
        select me.period_month as m, me.status as st, coalesce(sum(coalesce(mr.final_net, mr.proposed_net)), 0) as tot
        from public.hr_month_exports me left join public.hr_month_export_rows mr on mr.export_id = me.id
        where me.status in ('exported', 'approved') and me.period_month between date_trunc('month', p_from)::date and v_pay_month
          and not exists (select 1 from public.hr_month_exports me2 where me2.period_month = me.period_month and me2.status in ('exported', 'approved') and me2.version > me.version)
        group by me.period_month, me.status) x), '[]'::jsonb),
    'purchases', (select jsonb_build_object('orders', count(*), 'total', coalesce(sum(po.total_amount), 0), 'items', coalesce(sum(po.item_count), 0))
        from public.maintenance_purchase_orders po where po.created_at >= f and po.created_at < t),
    'budget', (select jsonb_build_object(
        'year', extract(year from p_to)::int,
        'allocated', coalesce(sum(b.allocated_amount), 0), 'spent', coalesce(sum(b.spent_amount), 0),
        'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', x.k, 'allocated', x.a, 'spent', x.s) order by x.a desc) from (
            select b2.category as k, sum(b2.allocated_amount) as a, sum(b2.spent_amount) as s from public.budget_allocations b2
            where b2.fiscal_year = extract(year from p_to)::int group by 1) x), '[]'::jsonb))
        from public.budget_allocations b where b.fiscal_year = extract(year from p_to)::int),
    'maintenance_cost', (select coalesce(sum(coalesce(m.actual_cost, 0) + coalesce(m.parts_actual_cost, 0) + coalesce(m.service_cost, 0)), 0)
        from public.vehicle_maintenance_cases m where m.reported_at >= f and m.reported_at < t)
  ) into j_fin;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'sector', v_sector_name, 'shift', p_shift, 'generated_at', now()),
    'workforce', j_work, 'complaints', j_comp, 'fleet', j_fleet, 'station', j_station,
    'disclosures', j_disc, 'media', j_media, 'gbs', j_gbs, 'supplies', j_sup, 'finance', j_fin);
end$$;
