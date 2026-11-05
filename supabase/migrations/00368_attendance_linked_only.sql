-- ═══════════════════════════════════════════════════════════════
-- 00368 · الجولة 00406 — إصلاحات الحضوريات (تدقيق 2026-11-05)
--   القاعدة المصدّقة من المستخدم: لا يظهر في الحضوريات ولا في الرواتب إلا الأشخاص المرتبطون ببصمة
--   (biometric_pin is not null). شبكة الشهر وتقييم الشهر وتغطيته تطبق ذلك أصلا (00186/00351)،
--   لكن ثلاث بوابات كانت تدخل غير المرتبطين فتخلق سجلات لا تظهر في الكشف وقد تتسرب للراتب:
--     1) app.attendance_edit_scope_employees - نطاق طلبات تعديل الحضور (00341) بلا شرط PIN:
--        كان يمكن إنشاء واعتماد حضور يدوي لموظف لا يظهر أصلا في شبكة الشهر.
--     2) public.attendance_edit_employee_search - بحث اختيار الموظفين في «تعديل جماعي» (00343).
--     3) app.hr_month_summary - ملخص الشهر المغذي لصفوف كشف الرواتب (00300): الـstaff بلا PIN،
--        واتحاد att/ded كان يبقي غير المرتبط صاحب أيام يدوية أو استقطاعات داخل الكشف.
--   لا تغيير في مراحل الموافقات أو الخصم أو محرك البصمة الناقصة.
-- ═══════════════════════════════════════════════════════════════

-- 1) نطاق طلبات التعديل: المرتبطون ببصمة فقط (نفس نص 00341 + شرط الربط)
create or replace function app.attendance_edit_scope_employees(p_kind text, p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public, app as $$
  select e.id from public.employees e
  where e.archived_at is null and coalesce(e.employment_status, '') <> 'terminated'
    and e.biometric_pin is not null
    and case p_kind
          when 'employees' then e.id = any(p_ids)
          when 'branch' then e.branch_id = p_ids[1]
          when 'department' then e.department_id = p_ids[1]
          when 'department_tree' then e.department_id in (select app.hr_department_tree(p_ids[1]))
          else false end
  order by e.full_name
$$;

-- 2) بحث اختيار الموظفين: المرتبطون ببصمة فقط (نفس نص 00343 + شرط الربط)
create or replace function public.attendance_edit_employee_search(p_search text default null)
returns table(id uuid, full_name text, employee_number text, department_name text)
language sql stable security definer set search_path = public, app as $$
  select e.id, e.full_name, e.employee_number, d.name
  from public.employees e left join public.departments d on d.id = e.department_id
  where app.has_role(array['ops_room', 'deputy_director', 'super_admin'])
    and e.archived_at is null and coalesce(e.employment_status, '') <> 'terminated'
    and e.biometric_pin is not null
    and (nullif(trim(coalesce(p_search, '')), '') is null or e.full_name ilike '%' || trim(p_search) || '%' or e.employee_number ilike '%' || trim(p_search) || '%')
  order by e.full_name
  limit 300
$$;
grant execute on function public.attendance_edit_employee_search(text) to authenticated;

-- 3) ملخص الشهر للرواتب: المرتبطون ببصمة فقط (نسخة 00300 + شرط الربط في staff والناتج النهائي)
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
    where e.archived_at is null and e.biometric_pin is not null and e.hire_date <= m.t
      and (e.employment_status <> 'terminated' or e.terminated_at is null or e.terminated_at >= m.f)),
  days as (
    select a.*,
      (a.status = 'leave' and exists (
         select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
         where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid
           and a.work_date between l.start_date and l.end_date)) as leave_paid
    from public.hr_attendance_days a join public.employees e on e.id = a.employee_id, m
    -- 00300: أيام ما بعد آخر يوم عمل (أو قبل التعيين) لا تدخل في الكشف ولا في التصفية — حتى لو كانت مقيَّمة سابقاً
    where a.work_date between greatest(m.f, e.hire_date) and least(m.t, coalesce(e.terminated_at, m.t))),
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
  ids as (select employee_id from staff union select employee_id from att union select employee_id from ded),
  linked as (select ids.employee_id from ids join public.employees e on e.id = ids.employee_id where e.biometric_pin is not null)
  select linked.employee_id, coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons,
         coalesce(att.auto_minutes, 0), coalesce(att.auto_days, 0), coalesce(att.shift_minutes, 480), coalesce(att.overtime_minutes, 0), coalesce(att.shortfall_minutes, 0),
         coalesce(att.days_leave_paid, 0), coalesce(att.days_leave_unpaid, 0), coalesce(att.auto_days_absence, 0), coalesce(att.auto_days_shortfall, 0),
         coalesce(cov.scheduled_days, 0), coalesce(cov.unevaluated_days, 0)
  from linked left join att on att.employee_id = linked.employee_id left join ded on ded.employee_id = linked.employee_id left join cov on cov.employee_id = linked.employee_id
$$;
