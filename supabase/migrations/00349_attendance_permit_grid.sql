-- الجولة 00399-أ: تصنيف الزمنية حضوراً في مجاميع الشبكة لا إجازة. لا تغيّر سجلات الحضور أو الرواتب.
create or replace function public.ops_attendance_month_grid(p_month date, p_branch uuid default null, p_department uuid default null, p_search text default null)
returns table (
  employee_id uuid, employee_number text, full_name text, job_title text, department_id uuid, department_name text, branch_name text, contract_type text,
  days jsonb, present_days int, late_days int, early_days int, incomplete_days int, absent_days int, leave_days int, rest_days int, unevaluated_days int,
  worked_minutes int, late_minutes int, early_minutes int, shortfall_minutes int, overtime_minutes int, permit_minutes int, proposed_minutes int, proposed_days numeric
) language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t, app.hr_local_date(now()) as today),
  deps as (select id from public.departments where p_department is null or id = p_department or parent_id = p_department),
  emp as (
    select e.id, e.employee_number, e.full_name, e.job_title, e.department_id, d.name as department_name, b.name as branch_name, e.contract_type, e.hire_date, e.terminated_at
    from public.employees e cross join m
    left join public.departments d on d.id = e.department_id
    left join public.branches b on b.id = e.branch_id
    where e.archived_at is null and e.biometric_pin is not null and e.hire_date <= m.t and (e.terminated_at is null or e.terminated_at >= m.f)
      and (p_branch is null or e.branch_id = p_branch)
      and (p_department is null or e.department_id in (select id from deps))
      and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
      and app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'it_admin', 'super_admin'])),
  cal as (select e.id as employee_id, g::date as d from emp e, m, generate_series(m.f, m.t, interval '1 day') g),
  cell as (
    select c.employee_id, c.d, a.status,
           coalesce(a.is_rest_day, sh.shift_id is not null and not (extract(dow from c.d)::smallint = any (sh.work_days))) as is_rest_day, a.source, a.check_in, a.check_out, a.worked_minutes, a.late_minutes, a.early_minutes, a.shortfall_minutes, a.overtime_minutes, a.permit_minutes,
           a.proposed_deduction_minutes, a.proposed_deduction_days, a.deduction_waived, a.edit_reason,
           (a.id is null and c.d >= e.hire_date and c.d <= coalesce(e.terminated_at, c.d) and c.d < m.today
              and not (sh.shift_id is not null and not (extract(dow from c.d)::smallint = any (sh.work_days)))) as unevaluated,
           (c.d < e.hire_date or (e.terminated_at is not null and c.d > e.terminated_at)) as out_of_service
    from cal c join emp e on e.id = c.employee_id cross join m
    left join public.hr_attendance_days a on a.employee_id = c.employee_id and a.work_date = c.d
    left join lateral app.hr_effective_shift(c.employee_id, c.d) sh on a.id is null)
  select e.id, e.employee_number, e.full_name, e.job_title, e.department_id, e.department_name, e.branch_name, e.contract_type,
    (select jsonb_agg(jsonb_build_object('d', c.d, 's', case when c.out_of_service then 'none' when c.unevaluated then 'pending' when c.status is null and c.is_rest_day and c.d < (select today from m) then 'rest' when c.status is null then 'future' else c.status end,
        'rest', coalesce(c.is_rest_day, false), 'src', c.source,
        'in', case when c.check_in is null then null else to_char(c.check_in + app.hr_tz(), 'HH24:MI') end,
        'out', case when c.check_out is null then null else to_char(c.check_out + app.hr_tz(), 'HH24:MI') end,
        'w', coalesce(c.worked_minutes, 0), 'late', coalesce(c.late_minutes, 0), 'early', coalesce(c.early_minutes, 0), 'short', coalesce(c.shortfall_minutes, 0), 'ot', coalesce(c.overtime_minutes, 0), 'permit', coalesce(c.permit_minutes, 0),
        'pm', coalesce(c.proposed_deduction_minutes, 0), 'pd', coalesce(c.proposed_deduction_days, 0), 'waived', coalesce(c.deduction_waived, false), 'note', c.edit_reason) order by c.d)
     from cell c where c.employee_id = e.id),
    (select count(*) from cell c where c.employee_id = e.id and c.status in ('present', 'time_permit'))::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'late')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'early_leave')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'incomplete')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'absent')::int,
    (select count(*) from cell c where c.employee_id = e.id and c.status = 'leave')::int,
    (select count(*) from cell c where c.employee_id = e.id and coalesce(c.is_rest_day, false))::int,
    (select count(*) from cell c where c.employee_id = e.id and c.unevaluated)::int,
    (select coalesce(sum(c.worked_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.late_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.early_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.shortfall_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.overtime_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.permit_minutes), 0) from cell c where c.employee_id = e.id)::int,
    (select coalesce(sum(c.proposed_deduction_minutes), 0) from cell c where c.employee_id = e.id and not coalesce(c.deduction_waived, false))::int,
    (select coalesce(sum(c.proposed_deduction_days), 0) from cell c where c.employee_id = e.id and not coalesce(c.deduction_waived, false))
  from emp e
  order by e.department_name nulls last, e.full_name
$$;
