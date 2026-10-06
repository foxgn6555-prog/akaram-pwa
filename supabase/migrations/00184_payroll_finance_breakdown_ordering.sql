-- 00184 · الجولة الثانية (البصمة → الحضور → المالية): صحة احتساب كشف الرواتب وتفصيل الاستقطاعات وترتيبه
--
-- ① ملخص الشهر يفرّق الإجازة المدفوعة عن غير المدفوعة، ويفصل أيام الاستقطاع التلقائي الناتجة عن الغياب/الإجازة
--    غير المدفوعة/البصمة الناقصة (أيام غير حاضر) عن تلك الناتجة عن شرائح النقص في أيام الحضور.
-- ② الأجر اليومي: تُدفع أيام الحضور + أيام الإجازة المدفوعة (الأنواع المدفوعة محايدة للراتب)، ولا تُستقطع أيام
--    الغياب مرتين (يوم الغياب غير مدفوع أصلاً فلا يُخصم منه «يوم» إضافي) — تبقى استقطاعات النقص بالدقائق/الشرائح.
--    المخصصات والاستقطاعات الثابتة في ملف الراتب تُطبَّق على النوعين (شهري/يومي) بدلاً من تجاهلها للأجر اليومي.
-- ③ الكشف يحمل الإجمالي (gross) وإجمالي الاستقطاعات ومبلغ أيام استقطاع العمليات حتى يراجعه المحاسب رقماً برقم.
-- ④ ترتيب موحّد: القسم (بلا قسم آخراً) ← الرقم الوظيفي (ترتيب طبيعي رقمي) ← الاسم، في كشف المالية وفي صفوف غرفة العمليات.

-- ─── ① ملخص الشهر ─────────────────────────────────────────────────────────────
drop function if exists app.hr_month_summary(date);
create or replace function app.hr_month_summary(p_month date)
returns table(employee_id uuid, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
              days_leave int, late_minutes int, early_minutes int, ded_amount numeric, ded_days numeric, ded_reasons text,
              auto_minutes int, auto_days numeric, shift_minutes int, overtime_minutes int, shortfall_minutes int,
              days_leave_paid int, days_leave_unpaid int, auto_days_absence numeric, auto_days_shortfall numeric)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  staff as (
    select e.id as employee_id from public.employees e, m
    where e.archived_at is null and e.hire_date <= m.t
      and (e.employment_status <> 'terminated' or e.terminated_at is null or e.terminated_at >= m.f)),
  days as (
    select a.*,
      -- إجازة مدفوعة = يوم بحالة «إجازة» تغطيه إجازة معتمدة من نوع مدفوع (غير ذلك تُعدّ غير مدفوعة)
      (a.status = 'leave' and exists (
         select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
         where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid
           and a.work_date between l.start_date and l.end_date)) as leave_paid
    from public.hr_attendance_days a, m where a.work_date between m.f and m.t),
  att as (
    select a.employee_id,
      count(*) filter (where not a.is_rest_day)::int as working_days,
      count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit'))::int as days_present,
      count(*) filter (where a.status = 'late')::int as days_late,
      count(*) filter (where a.status = 'absent')::int as days_absent,
      count(*) filter (where a.status = 'incomplete')::int as days_incomplete,
      count(*) filter (where a.status = 'leave')::int as days_leave,
      coalesce(sum(a.late_minutes), 0)::int as late_minutes, coalesce(sum(a.early_minutes), 0)::int as early_minutes,
      coalesce(sum(a.proposed_deduction_minutes) filter (where not a.deduction_waived), 0)::int as auto_minutes,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived), 0) as auto_days,
      coalesce(nullif(max(a.required_minutes), 0), 480)::int as shift_minutes,
      coalesce(sum(a.overtime_minutes), 0)::int as overtime_minutes,
      coalesce(sum(a.shortfall_minutes), 0)::int as shortfall_minutes,
      count(*) filter (where a.leave_paid)::int as days_leave_paid,
      count(*) filter (where a.status = 'leave' and not a.leave_paid)::int as days_leave_unpaid,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived and a.status not in ('present', 'late', 'early_leave', 'time_permit')), 0) as auto_days_absence,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived and a.status in ('present', 'late', 'early_leave', 'time_permit')), 0) as auto_days_shortfall
    from days a group by a.employee_id),
  ded as (
    select d.employee_id, sum(d.amount) as amt, sum(d.days) as dys, string_agg(d.reason, ' · ' order by d.created_at) as reasons
    from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id),
  ids as (select employee_id from staff union select employee_id from att union select employee_id from ded)
  select ids.employee_id, coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons,
         coalesce(att.auto_minutes, 0), coalesce(att.auto_days, 0), coalesce(att.shift_minutes, 480), coalesce(att.overtime_minutes, 0), coalesce(att.shortfall_minutes, 0),
         coalesce(att.days_leave_paid, 0), coalesce(att.days_leave_unpaid, 0), coalesce(att.auto_days_absence, 0), coalesce(att.auto_days_shortfall, 0)
  from ids left join att on att.employee_id = ids.employee_id left join ded on ded.employee_id = ids.employee_id
$$;

-- ─── ② أعمدة التفصيل في صفوف التصدير ─────────────────────────────────────────
alter table public.hr_month_export_rows
  add column if not exists days_leave_paid        integer not null default 0,
  add column if not exists days_leave_unpaid      integer not null default 0,
  add column if not exists auto_absence_days      numeric(6, 2) not null default 0,
  add column if not exists auto_shortfall_days    numeric(6, 2) not null default 0,
  add column if not exists ops_deduction_days_amount numeric(14, 2),
  add column if not exists payable_days           numeric(6, 2),
  add column if not exists gross_amount           numeric(14, 2),
  add column if not exists deductions_total       numeric(14, 2);

-- مفتاح ترتيب موحّد للكشوف
create or replace function app.hr_employee_sort_key(p_number text)
returns text language sql immutable as $$
  select lpad(coalesce(nullif(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), ''), '0'), 20, '0') || '|' || coalesce(p_number, '')
$$;

-- ─── ③ التصدير إلى المالية بمعادلة موثّقة ──────────────────────────────────────
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, s.auto_days, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    sp.pay_type, sp.base_salary, sp.daily_rate, al.total, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.allowances, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') al
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.fixed_deductions, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') fd
  cross join lateral (
    select x.*,
      case when sp.employee_id is null then null else greatest(0, round(x.gross - x.deductions, 2)) end as net
    from (
      select r.payable_days, r.auto_amount, r.ops_days_amount,
        case when sp.employee_id is null then null
             when sp.pay_type = 'daily' then round(sp.daily_rate * r.payable_days + al.total, 2)
             else round(sp.base_salary + al.total, 2) end as gross,
        case when sp.employee_id is null then null
             else round(fd.total + s.ded_amount + r.ops_days_amount + r.auto_amount, 2) end as deductions
      from (
        select
          case when sp.pay_type = 'daily' then (s.days_present + s.days_leave_paid)::numeric else null end as payable_days,
          -- الأجر اليومي: أيام الغياب/الإجازة غير المدفوعة غير مدفوعة أصلاً → لا تُخصم مرة ثانية؛ تُخصم شرائح النقص فقط
          round(rates.minute_rate * s.auto_minutes + rates.day_rate * (case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end), 2) as auto_amount,
          round(rates.day_rate * s.ded_days, 2) as ops_days_amount
        from (select
          case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then sp.daily_rate else round(sp.base_salary / 30, 4) end as day_rate,
          case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(sp.base_salary / 30 / greatest(s.shift_minutes, 1), 4) end as minute_rate
        ) rates) r) x) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  return v_id;
end$$;

-- ─── ④ الترتيب الموحّد + الأعمدة الجديدة في الكشوف ────────────────────────────
drop function if exists public.ops_month_export_rows(uuid);
create or replace function public.ops_month_export_rows(p_export uuid)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, branch_name text, job_title text, contract_type text,
  working_days int, days_present int, days_late int, days_absent int, days_incomplete int, days_leave int, late_minutes int, early_minutes int,
  ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, overtime_minutes int, shortfall_minutes int,
  days_leave_paid int, days_leave_unpaid int, auto_absence_days numeric, auto_shortfall_days numeric)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons, r.auto_deduction_minutes, r.auto_deduction_days, r.overtime_minutes, r.shortfall_minutes,
         r.days_leave_paid, r.days_leave_unpaid, r.auto_absence_days, r.auto_shortfall_days
  from public.hr_month_export_rows r
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) and r.export_id = p_export
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.ops_month_export_rows(uuid) to authenticated;

drop function if exists public.finance_payroll_sheet(date);
create or replace function public.finance_payroll_sheet(p_month date)
returns table(export_id uuid, export_version int, export_status text, exported_at timestamptz, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, contract_type text, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
  days_leave int, late_minutes int, early_minutes int, ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, auto_deduction_amount numeric, overtime_minutes int, shortfall_minutes int,
  pay_type text, base_salary numeric, daily_rate numeric, allowances_total numeric, fixed_deductions_total numeric, proposed_net numeric, final_net numeric, finance_note text,
  days_leave_paid int, days_leave_unpaid int, auto_absence_days numeric, auto_shortfall_days numeric, ops_deduction_days_amount numeric,
  payable_days numeric, gross_amount numeric, deductions_total numeric)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select x.id, x.version, x.status, x.exported_at, r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons,
         r.auto_deduction_minutes, r.auto_deduction_days, r.auto_deduction_amount, r.overtime_minutes, r.shortfall_minutes,
         r.pay_type, r.base_salary, r.daily_rate, r.allowances_total, r.fixed_deductions_total,
         r.proposed_net, r.final_net, r.finance_note,
         r.days_leave_paid, r.days_leave_unpaid, r.auto_absence_days, r.auto_shortfall_days, r.ops_deduction_days_amount,
         r.payable_days, r.gross_amount, r.deductions_total
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;
