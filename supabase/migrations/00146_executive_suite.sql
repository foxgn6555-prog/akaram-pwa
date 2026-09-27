-- 00146 · منظومة الإدارة العليا (المدير المفوض / المدير التنفيذي / المعاون / المالية):
--   ① exec_overview(from,to,sector,shift): ملخص محلَّل لكل وحدات الشركة (بيانات صافية — لا شيء تقني)
--   ② التبليغات الداخلية: نشر منشور موجَّه (الكل / أدوار / أقسام / أشخاص) مع إيصالات قراءة/إقرار وإشعار للمستهدفين
-- القاعدة: كل شيء عبر RPC بصلاحيات مضبوطة؛ الجداول محمية بـ RLS.

-- ═══════════════════════════════════════════════════════════════════════
-- ① أدوات مساعدة
-- ═══════════════════════════════════════════════════════════════════════
create or replace function app.is_executive() returns boolean
language sql stable security definer set search_path = public, app as
$$ select app.has_role(array['super_admin', 'executive_director', 'deputy_director', 'finance_officer']) $$;

create or replace function app.user_display_name(p_user uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select e.full_name from public.employees e where e.user_id = p_user limit 1),
    (select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p_user),
    (select u.email from auth.users u where u.id = p_user),
    'مستخدم')
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ② الملخص التنفيذي الموحّد
-- ═══════════════════════════════════════════════════════════════════════
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
        select coalesce(d2.violation_type, 'غير محدد') as k, count(*) as c from public.disclosures d2 where d2.log_date between p_from and p_to and d2.archived_at is null
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
grant execute on function public.exec_overview(date, date, smallint, text) to authenticated;

-- قائمة القواطع والشفتات المتاحة للفلاتر (بيانات مرجعية خفيفة)
create or replace function public.exec_filter_options() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.is_executive() then jsonb_build_object(
    'sectors', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'parent', s.parent_sector) order by s.sort, s.id) from public.sectors s), '[]'::jsonb),
    'shifts', '[{"key":"morning","label":"صباحي"},{"key":"evening","label":"مسائي"},{"key":"night","label":"ليلي"}]'::jsonb,
    'parents', '[{"key":"karrada","label":"الكرادة"},{"key":"zaafaraniya","label":"الزعفرانية"}]'::jsonb)
  else null end
$$;
grant execute on function public.exec_filter_options() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ③ التبليغات الداخلية
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.announcements (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null check (length(trim(title)) between 3 and 160),
  body                 text not null check (length(trim(body)) between 3 and 6000),
  priority             text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  audience_kind        text not null check (audience_kind in ('all', 'roles', 'departments', 'users')),
  audience_roles       text[] not null default '{}',
  audience_departments uuid[] not null default '{}',
  audience_users       uuid[] not null default '{}',
  requires_ack         boolean not null default false,
  pinned               boolean not null default false,
  attachment_path      text,
  published_by         uuid not null references auth.users (id) on delete cascade,
  publisher_name       text not null,
  publisher_role       text not null,
  published_at         timestamptz not null default now(),
  expires_at           timestamptz,
  archived_at          timestamptz,
  archive_reason       text,
  recipients_count     integer not null default 0
);
create index if not exists announcements_published_idx on public.announcements (published_at desc) where archived_at is null;

create table if not exists public.announcement_receipts (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  delivered_at    timestamptz not null default now(),
  read_at         timestamptz,
  acked_at        timestamptz,
  primary key (announcement_id, user_id)
);
create index if not exists announcement_receipts_user_idx on public.announcement_receipts (user_id, read_at);

alter table public.announcements enable row level security;
alter table public.announcement_receipts enable row level security;
drop policy if exists "announcements: recipients & publishers" on public.announcements;
create policy "announcements: recipients & publishers" on public.announcements for select to authenticated
  using (published_by = auth.uid() or app.has_role(array['super_admin'])
         or exists (select 1 from public.announcement_receipts r where r.announcement_id = id and r.user_id = auth.uid()));
drop policy if exists "receipts: own" on public.announcement_receipts;
create policy "receipts: own" on public.announcement_receipts for select to authenticated using (user_id = auth.uid());

-- حلّ الجمهور إلى قائمة مستخدمين
create or replace function app.announcement_resolve_audience(p_kind text, p_roles text[], p_departments uuid[], p_users uuid[])
returns setof uuid language sql stable security definer set search_path = public, app as $$
  select distinct u from (
    select ur.user_id as u from public.user_roles ur where p_kind = 'all'
    union all
    select ur.user_id from public.user_roles ur where p_kind = 'roles' and ur.role = any(p_roles)
    union all
    select e.user_id from public.employees e where p_kind = 'departments' and e.user_id is not null and e.archived_at is null
      and e.employment_status = 'active' and e.department_id = any(p_departments)
    union all
    select unnest(p_users) where p_kind = 'users'
  ) x where u is not null
$$;

create or replace function public.announcement_publish(
  p_title text, p_body text, p_priority text default 'normal', p_audience_kind text default 'all',
  p_roles text[] default '{}', p_departments uuid[] default '{}', p_users uuid[] default '{}',
  p_requires_ack boolean default false, p_pinned boolean default false, p_expires_at timestamptz default null, p_attachment_path text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; v_count int; v_role text; v_type text;
begin
  if not app.is_executive() then raise exception 'ANN_FORBIDDEN'; end if;
  if coalesce(length(trim(p_title)), 0) < 3 then raise exception 'ANN_TITLE_REQUIRED'; end if;
  if coalesce(length(trim(p_body)), 0) < 3 then raise exception 'ANN_BODY_REQUIRED'; end if;
  if p_priority not in ('normal', 'important', 'urgent') then raise exception 'ANN_PRIORITY_INVALID'; end if;
  if p_audience_kind not in ('all', 'roles', 'departments', 'users') then raise exception 'ANN_AUDIENCE_INVALID'; end if;
  if p_audience_kind = 'roles' and coalesce(array_length(p_roles, 1), 0) = 0 then raise exception 'ANN_AUDIENCE_EMPTY'; end if;
  if p_audience_kind = 'departments' and coalesce(array_length(p_departments, 1), 0) = 0 then raise exception 'ANN_AUDIENCE_EMPTY'; end if;
  if p_audience_kind = 'users' and coalesce(array_length(p_users, 1), 0) = 0 then raise exception 'ANN_AUDIENCE_EMPTY'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'ANN_EXPIRY_INVALID'; end if;

  select ur.role into v_role from public.user_roles ur where ur.user_id = auth.uid()
    order by array_position(array['super_admin', 'executive_director', 'deputy_director', 'finance_officer'], ur.role) nulls last limit 1;

  insert into public.announcements (title, body, priority, audience_kind, audience_roles, audience_departments, audience_users,
    requires_ack, pinned, attachment_path, published_by, publisher_name, publisher_role, expires_at)
  values (trim(p_title), trim(p_body), p_priority, p_audience_kind, coalesce(p_roles, '{}'), coalesce(p_departments, '{}'), coalesce(p_users, '{}'),
    p_requires_ack, p_pinned, p_attachment_path, auth.uid(), app.user_display_name(auth.uid()), coalesce(v_role, 'super_admin'), p_expires_at)
  returning id into v_id;

  insert into public.announcement_receipts (announcement_id, user_id)
  select v_id, u from app.announcement_resolve_audience(p_audience_kind, p_roles, p_departments, p_users) u;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'ANN_NO_RECIPIENTS'; end if;
  update public.announcements set recipients_count = v_count where id = v_id;

  v_type := case p_priority when 'urgent' then 'error' when 'important' then 'warning' else 'info' end;
  insert into public.notifications (user_id, title, body, type, category, priority, link, entity_type, entity_id, action_label, dedupe_key)
  select r.user_id,
         case p_priority when 'urgent' then '🔴 تبليغ عاجل: ' when 'important' then '🟠 تبليغ مهم: ' else 'تبليغ: ' end || trim(p_title),
         left(trim(p_body), 180) || case when length(trim(p_body)) > 180 then '…' else '' end,
         v_type, 'system', case p_priority when 'urgent' then 'critical' when 'important' then 'high' else 'normal' end,
         '/announcements/' || v_id::text, 'announcement', v_id, case when p_requires_ack then 'قراءة وإقرار' else 'قراءة التبليغ' end, 'ann:' || v_id::text
  from public.announcement_receipts r where r.announcement_id = v_id
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return v_id;
end$$;
grant execute on function public.announcement_publish(text, text, text, text, text[], uuid[], uuid[], boolean, boolean, timestamptz, text) to authenticated;

-- الوارد (inbox) للمستخدم الحالي أو الصادر (sent) للناشر
create or replace function public.announcement_feed(p_scope text default 'inbox', p_limit int default 50, p_include_archived boolean default false)
returns table (
  id uuid, title text, body text, priority text, audience_kind text, audience_roles text[], audience_departments uuid[], audience_users uuid[],
  requires_ack boolean, pinned boolean, attachment_path text, published_by uuid, publisher_name text, publisher_role text,
  published_at timestamptz, expires_at timestamptz, archived_at timestamptz,
  recipients_count int, read_count bigint, ack_count bigint, my_read_at timestamptz, my_acked_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.title, a.body, a.priority, a.audience_kind, a.audience_roles, a.audience_departments, a.audience_users,
         a.requires_ack, a.pinned, a.attachment_path, a.published_by, a.publisher_name, a.publisher_role,
         a.published_at, a.expires_at, a.archived_at, a.recipients_count,
         (select count(*) from public.announcement_receipts r2 where r2.announcement_id = a.id and r2.read_at is not null),
         (select count(*) from public.announcement_receipts r2 where r2.announcement_id = a.id and r2.acked_at is not null),
         r.read_at, r.acked_at, a.published_by = auth.uid()
  from public.announcements a
  left join public.announcement_receipts r on r.announcement_id = a.id and r.user_id = auth.uid()
  where (p_include_archived or a.archived_at is null)
    and case coalesce(p_scope, 'inbox')
          when 'sent' then (a.published_by = auth.uid() or app.has_role(array['super_admin']))
          else r.user_id is not null and (a.expires_at is null or a.expires_at > now()) end
  order by a.pinned desc, a.published_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;
grant execute on function public.announcement_feed(text, int, boolean) to authenticated;

create or replace function public.announcement_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare a record; r record;
begin
  select * into a from public.announcements where id = p_id;
  if not found then raise exception 'ANN_NOT_FOUND'; end if;
  select * into r from public.announcement_receipts where announcement_id = p_id and user_id = auth.uid();
  if r.user_id is null and a.published_by <> auth.uid() and not app.has_role(array['super_admin']) then raise exception 'ANN_FORBIDDEN'; end if;
  if r.user_id is not null and r.read_at is null then
    update public.announcement_receipts set read_at = now() where announcement_id = p_id and user_id = auth.uid();
    update public.notifications set is_read = true, read_at = coalesce(read_at, now()) where user_id = auth.uid() and dedupe_key = 'ann:' || p_id::text;
  end if;
  return to_jsonb(a) || jsonb_build_object(
    'my_read_at', coalesce(r.read_at, case when r.user_id is not null then now() end), 'my_acked_at', r.acked_at, 'is_mine', a.published_by = auth.uid(),
    'read_count', (select count(*) from public.announcement_receipts x where x.announcement_id = p_id and x.read_at is not null),
    'ack_count',  (select count(*) from public.announcement_receipts x where x.announcement_id = p_id and x.acked_at is not null));
end$$;
grant execute on function public.announcement_get(uuid) to authenticated;

create or replace function public.announcement_ack(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update public.announcement_receipts set acked_at = coalesce(acked_at, now()), read_at = coalesce(read_at, now())
  where announcement_id = p_id and user_id = auth.uid();
  if not found then raise exception 'ANN_NOT_RECIPIENT'; end if;
end$$;
grant execute on function public.announcement_ack(uuid) to authenticated;

create or replace function public.announcement_archive(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record;
begin
  select * into a from public.announcements where id = p_id;
  if not found then raise exception 'ANN_NOT_FOUND'; end if;
  if a.published_by <> auth.uid() and not app.has_role(array['super_admin']) then raise exception 'ANN_FORBIDDEN'; end if;
  update public.announcements set archived_at = now(), archive_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_id and archived_at is null;
  update public.notifications set dismissed_at = coalesce(dismissed_at, now()) where dedupe_key = 'ann:' || p_id::text;
end$$;
grant execute on function public.announcement_archive(uuid, text) to authenticated;

-- من قرأ ومن أقرّ (للناشر فقط)
create or replace function public.announcement_recipients(p_id uuid)
returns table (user_id uuid, full_name text, department_name text, delivered_at timestamptz, read_at timestamptz, acked_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
declare a record;
begin
  select * into a from public.announcements where id = p_id;
  if not found then raise exception 'ANN_NOT_FOUND'; end if;
  if a.published_by <> auth.uid() and not app.has_role(array['super_admin']) then raise exception 'ANN_FORBIDDEN'; end if;
  return query
    select r.user_id, app.user_display_name(r.user_id), (select d.name from public.employees e join public.departments d on d.id = e.department_id where e.user_id = r.user_id limit 1),
           r.delivered_at, r.read_at, r.acked_at
    from public.announcement_receipts r where r.announcement_id = p_id
    order by r.acked_at nulls last, r.read_at nulls last, 2;
end$$;
grant execute on function public.announcement_recipients(uuid) to authenticated;

create or replace function public.announcement_unread_count() returns int
language sql stable security definer set search_path = public, app as $$
  select count(*)::int from public.announcement_receipts r join public.announcements a on a.id = r.announcement_id
  where r.user_id = auth.uid() and r.read_at is null and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
$$;
grant execute on function public.announcement_unread_count() to authenticated;

-- خيارات الاستهداف: الأدوار والأقسام والمستخدمون (أسماء فقط)
create or replace function public.announcement_targets() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.is_executive() then jsonb_build_object(
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', x.role, 'count', x.c) order by x.c desc) from (
        select ur.role, count(distinct ur.user_id) as c from public.user_roles ur group by 1) x), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'count', (
        select count(*) from public.employees e where e.department_id = d.id and e.user_id is not null and e.archived_at is null and e.employment_status = 'active')) order by d.name)
        from public.departments d where d.is_active and d.archived_at is null), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', x.uid, 'name', x.nm, 'department', x.dn) order by x.nm) from (
        select distinct ur.user_id as uid, app.user_display_name(ur.user_id) as nm,
               (select d.name from public.employees e join public.departments d on d.id = e.department_id where e.user_id = ur.user_id limit 1) as dn
        from public.user_roles ur) x), '[]'::jsonb),
    'total_users', (select count(distinct ur.user_id) from public.user_roles ur))
  else null end
$$;
grant execute on function public.announcement_targets() to authenticated;
