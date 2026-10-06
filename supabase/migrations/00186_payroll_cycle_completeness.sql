-- 00186 · دورة الرواتب: اكتمال الاحتساب قبل التصدير + كشف الأيام غير المحتسبة + شفافية المعادلة
--
-- المشكلة المرصودة: موظف براتب شهري 100,000 ظهر في كشف المالية بـ«أيام العمل 5 · حاضر 3» وصافٍ 90,000.
-- السبب الجذري: ملخص الشهر يعتمد على صفوف hr_attendance_days فقط؛ والاحتساب التلقائي يغطي آخر يومين (lookback)
-- ويوم البصمة عند وصولها — فالأيام التي لم تُقيَّم (لا بصمة ولا احتساب) لا تظهر غياباً ولا تُستقطع، فيُدفع الراتب كاملاً تقريباً.
--
-- ① app.hr_evaluate_month(m): احتساب كل أيام الشهر (حتى أمس) لكل الموظفين أصحاب البصمة — يُستدعى تلقائياً داخل
--    ops_month_export قبل بناء الكشف، فلا يصل للمالية كشف ناقص الاحتساب.
-- ② «أيام غير محتسبة» (days_unevaluated): أيام مجدولة ماضية بلا صف احتساب — في ملخص الشهر وصفوف التصدير وكشف المالية
--    وحالة التصدير (hr_month_export_status) → لافتة في الحضوريات وكشف المالية.
-- ③ أيام العمل المجدولة (scheduled_days) في الكشف حتى يفهم المحاسب: مجدول 26 · محتسب 26 · حاضر 3 · غائب 23.

-- ─── ① احتساب شهر كامل ─────────────────────────────────────────────────────────
create or replace function app.hr_evaluate_month(p_month date) returns integer
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; last date; today date := app.hr_local_date(now()); e record; d date; n int := 0;
begin
  if app.hr_month_locked(m) then return 0; end if;
  last := least((m + interval '1 month - 1 day')::date, today - 1);
  if last < m then return 0; end if;
  for e in select id, hire_date, terminated_at from public.employees
           where archived_at is null and biometric_pin is not null and hire_date <= last
             and (employment_status <> 'terminated' or terminated_at is null or terminated_at >= m) loop
    d := greatest(m, e.hire_date);
    while d <= least(last, coalesce(e.terminated_at, last)) loop
      if app.hr_evaluate_day_safe(e.id, d) then n := n + 1; end if;
      d := d + 1;
    end loop;
  end loop;
  return n;
end$$;

-- ─── ② الأيام المجدولة وغير المحتسبة لكل موظف ──────────────────────────────────
-- يوم مجدول = ضمن مدة الخدمة، ماضٍ (قبل اليوم)، وليس يوم راحة في شفت الموظف (بلا شفت: كل يوم)
create or replace function app.hr_month_coverage(p_month date)
returns table(employee_id uuid, scheduled_days int, unevaluated_days int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, app.hr_local_date(now()) - 1) as t),
  staff as (
    select e.id, greatest(m.f, e.hire_date) as d_from, least(m.t, coalesce(e.terminated_at, m.t)) as d_to
    from public.employees e, m
    where e.archived_at is null and e.biometric_pin is not null and e.hire_date <= m.t
      and (e.employment_status <> 'terminated' or e.terminated_at is null or e.terminated_at >= m.f)),
  days as (
    select s.id as employee_id, g::date as d
    from staff s cross join lateral generate_series(s.d_from, s.d_to, interval '1 day') g
    where s.d_from <= s.d_to),
  sched as (
    select x.employee_id, x.d
    from days x cross join lateral app.hr_effective_shift(x.employee_id, x.d) sh
    where sh.shift_id is null or extract(dow from x.d)::smallint = any (sh.work_days)
    union
    -- موظف بلا أي شفت: كل يوم مجدول
    select x.employee_id, x.d from days x where not exists (select 1 from app.hr_effective_shift(x.employee_id, x.d) sh where sh.shift_id is not null))
  select s.employee_id, count(*)::int as scheduled_days,
         count(*) filter (where not exists (select 1 from public.hr_attendance_days a where a.employee_id = s.employee_id and a.work_date = s.d))::int as unevaluated_days
  from sched s group by s.employee_id
$$;

drop function if exists app.hr_month_summary(date);
create or replace function app.hr_month_summary(p_month date)
returns table(employee_id uuid, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
              days_leave int, late_minutes int, early_minutes int, ded_amount numeric, ded_days numeric, ded_reasons text,
              auto_minutes int, auto_days numeric, shift_minutes int, overtime_minutes int, shortfall_minutes int,
              days_leave_paid int, days_leave_unpaid int, auto_days_absence numeric, auto_days_shortfall numeric,
              scheduled_days int, unevaluated_days int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  staff as (
    select e.id as employee_id from public.employees e, m
    where e.archived_at is null and e.hire_date <= m.t
      and (e.employment_status <> 'terminated' or e.terminated_at is null or e.terminated_at >= m.f)),
  days as (
    select a.*,
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
  cov as (select * from app.hr_month_coverage(p_month)),
  ids as (select employee_id from staff union select employee_id from att union select employee_id from ded)
  select ids.employee_id, coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons,
         coalesce(att.auto_minutes, 0), coalesce(att.auto_days, 0), coalesce(att.shift_minutes, 480), coalesce(att.overtime_minutes, 0), coalesce(att.shortfall_minutes, 0),
         coalesce(att.days_leave_paid, 0), coalesce(att.days_leave_unpaid, 0), coalesce(att.auto_days_absence, 0), coalesce(att.auto_days_shortfall, 0),
         coalesce(cov.scheduled_days, 0), coalesce(cov.unevaluated_days, 0)
  from ids left join att on att.employee_id = ids.employee_id left join ded on ded.employee_id = ids.employee_id left join cov on cov.employee_id = ids.employee_id
$$;

alter table public.hr_month_export_rows
  add column if not exists scheduled_days   integer not null default 0,
  add column if not exists unevaluated_days integer not null default 0;

-- ─── التصدير: احتساب الشهر كاملاً أولاً ثم بناء الكشف ───────────────────────────
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  -- ① لا كشف ناقص الاحتساب: كل أيام الشهر الماضية تُقيَّم (الصفوف اليدوية محفوظة، والإعفاءات محفوظة)
  n_eval := app.hr_evaluate_month(m);
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    scheduled_days, unevaluated_days,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, s.auto_days, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days,
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
          round(rates.minute_rate * s.auto_minutes + rates.day_rate * (case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end), 2) as auto_amount,
          round(rates.day_rate * s.ded_days, 2) as ops_days_amount
        from (select
          case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then sp.daily_rate else round(sp.base_salary / 30, 4) end as day_rate,
          case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(sp.base_salary / 30 / greatest(s.shift_minutes, 1), 4) end as minute_rate
        ) rates) r) x) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  return v_id;
end$$;

-- ─── الكشوف تعرض الأيام المجدولة/غير المحتسبة ───────────────────────────────────
drop function if exists public.finance_payroll_sheet(date);
create or replace function public.finance_payroll_sheet(p_month date)
returns table(export_id uuid, export_version int, export_status text, exported_at timestamptz, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, contract_type text, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
  days_leave int, late_minutes int, early_minutes int, ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, auto_deduction_amount numeric, overtime_minutes int, shortfall_minutes int,
  pay_type text, base_salary numeric, daily_rate numeric, allowances_total numeric, fixed_deductions_total numeric, proposed_net numeric, final_net numeric, finance_note text,
  days_leave_paid int, days_leave_unpaid int, auto_absence_days numeric, auto_shortfall_days numeric, ops_deduction_days_amount numeric,
  payable_days numeric, gross_amount numeric, deductions_total numeric, scheduled_days int, unevaluated_days int, shift_minutes int)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select x.id, x.version, x.status, x.exported_at, r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons,
         r.auto_deduction_minutes, r.auto_deduction_days, r.auto_deduction_amount, r.overtime_minutes, r.shortfall_minutes,
         r.pay_type, r.base_salary, r.daily_rate, r.allowances_total, r.fixed_deductions_total,
         r.proposed_net, r.final_net, r.finance_note,
         r.days_leave_paid, r.days_leave_unpaid, r.auto_absence_days, r.auto_shortfall_days, r.ops_deduction_days_amount,
         r.payable_days, r.gross_amount, r.deductions_total, r.scheduled_days, r.unevaluated_days, r.shift_minutes
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

drop function if exists public.ops_month_export_rows(uuid);
create or replace function public.ops_month_export_rows(p_export uuid)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, branch_name text, job_title text, contract_type text,
  working_days int, days_present int, days_late int, days_absent int, days_incomplete int, days_leave int, late_minutes int, early_minutes int,
  ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, overtime_minutes int, shortfall_minutes int,
  days_leave_paid int, days_leave_unpaid int, auto_absence_days numeric, auto_shortfall_days numeric, scheduled_days int, unevaluated_days int)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons, r.auto_deduction_minutes, r.auto_deduction_days, r.overtime_minutes, r.shortfall_minutes,
         r.days_leave_paid, r.days_leave_unpaid, r.auto_absence_days, r.auto_shortfall_days, r.scheduled_days, r.unevaluated_days
  from public.hr_month_export_rows r
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) and r.export_id = p_export
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.ops_month_export_rows(uuid) to authenticated;

-- حالة التصدير تتضمن الأيام غير المحتسبة حالياً (قبل التصدير التالي)
create or replace function app.hr_month_export_status(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  x as (select * from public.hr_month_exports, m where period_month = m.f and status in ('exported', 'approved') order by version desc limit 1),
  cov as (select coalesce(sum(unevaluated_days), 0)::int as unevaluated, count(*) filter (where unevaluated_days > 0)::int as employees from app.hr_month_coverage(p_month))
  select case when x.id is null then jsonb_build_object('export_id', null, 'status', null, 'changes_after', 0, 'deductions_after', 0, 'disclosure_deductions_after', 0, 'needs_reexport', false,
                                                       'unevaluated_days', cov.unevaluated, 'unevaluated_employees', cov.employees)
    else jsonb_build_object(
      'export_id', x.id, 'version', x.version, 'status', x.status, 'exported_at', x.exported_at,
      'changes_after', (select count(*) from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve')),
      'deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at),
      'disclosure_deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at and d.source_disclosure_id is not null),
      'needs_reexport', x.status = 'exported' and exists (select 1 from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve')),
      'unevaluated_days', case when x.status = 'approved' then 0 else cov.unevaluated end,
      'unevaluated_employees', case when x.status = 'approved' then 0 else cov.employees end)
    end
  from (select 1) one cross join cov left join x on true
$$;

-- احتساب الشهر كاملاً من الواجهة (غرفة العمليات/HR)
create or replace function public.hr_attendance_evaluate_month(p_month date) returns integer
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(p_month) then raise exception 'HR_MONTH_LOCKED'; end if;
  return app.hr_evaluate_month(p_month);
end$$;
grant execute on function public.hr_attendance_evaluate_month(date) to authenticated;
