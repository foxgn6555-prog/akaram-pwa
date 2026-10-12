-- 00211 · المحطة التحويلية: وحدة «الموظفون» (الجولة 1 من 5) — المحطة ترى بياناتها فقط
-- النطاق = قسم حساب المحطة في الموارد البشرية (وفروعه)، بنفس آلية الكراج (00206/00207): app.disclosure_scope_depts().
-- حساب محطة بلا سجل موظف/قسم ⇒ خطأ واضح STATION_NO_DEPARTMENT. لا رواتب ولا بيانات حساسة (كما في garage_employees).

create or replace function app.disclosure_scope_depts() returns uuid[] language plpgsql stable security definer set search_path = public, app as $$
declare root uuid; station boolean;
begin
  if app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then return null; end if;
  station := app.has_role(array['transfer_station']);
  if not (station or app.has_role(array['central_garage_officer'])) then return null; end if;
  select e.department_id into root from public.employees e where e.user_id = auth.uid() and e.archived_at is null order by e.created_at desc limit 1;
  if root is null then
    if station then raise exception 'STATION_NO_DEPARTMENT'; end if;
    raise exception 'GARAGE_NO_DEPARTMENT';
  end if;
  return (with recursive t as (select id from public.departments where id = root
                               union all select d.id from public.departments d join t on d.parent_id = t.id)
          select array_agg(id) from t);
end$$;

-- garage_employees: السماح لحساب المحطة (النطاق يُقيّده تلقائياً بقسمه)
create or replace function public.garage_employees(p_q text default null, p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare scope uuid[]; m date := date_trunc('month', coalesce(p_month, current_date))::date; q text := nullif(trim(coalesce(p_q, '')), '');
        dept_name text; rows jsonb; summary jsonb;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  scope := app.disclosure_scope_depts();
  if scope is not null then select d.name into dept_name from public.departments d where d.id = scope[1]; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'job_title', e.job_title, 'department', coalesce(dp.name, '—'),
      'is_driver', e.is_driver, 'hire_date', e.hire_date, 'employment_status', e.employment_status, 'contract_type', e.contract_type, 'phone', e.phone,
      'shift', (select s.shift_name from app.hr_effective_shift(e.id, current_date) s),
      'vehicle', (select string_agg(distinct gv.db_number, '، ') from public.garage_vehicles gv where gv.driver_employee_id = e.id and gv.archived_at is null),
      'month', (select jsonb_build_object(
          'present', count(*) filter (where a.status in ('present','late','early_leave','time_permit')),
          'late', count(*) filter (where a.status = 'late'), 'absent', count(*) filter (where a.status = 'absent'),
          'leave', count(*) filter (where a.status = 'leave'), 'working_days', count(*))
        from public.hr_attendance_days a where a.employee_id = e.id and not a.is_rest_day and a.work_date >= m and a.work_date < (m + interval '1 month')::date and a.work_date <= current_date),
      'open_disclosures', (select count(*) from public.disclosures d where d.employee_id = e.id and d.status in ('draft','pending','returned') and d.archived_at is null),
      'approved_disclosures_month', (select count(*) from public.disclosures d where d.employee_id = e.id and d.status = 'approved' and d.period_month = m)
    ) order by e.is_driver desc, e.full_name), '[]'::jsonb)
  into rows
  from public.employees e left join public.departments dp on dp.id = e.department_id
  where e.archived_at is null and e.employment_status <> 'terminated'
    and (scope is null or e.department_id = any(scope))
    and (q is null or e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%' or coalesce(e.job_title, '') ilike '%' || q || '%');
  summary := jsonb_build_object(
    'total', jsonb_array_length(rows),
    'drivers', (select count(*) from jsonb_array_elements(rows) r where (r ->> 'is_driver')::boolean),
    'active', (select count(*) from jsonb_array_elements(rows) r where r ->> 'employment_status' = 'active'),
    'on_leave', (select count(*) from jsonb_array_elements(rows) r where r ->> 'employment_status' = 'on_leave'),
    'absent_today', (select count(*) from public.hr_attendance_days a join public.employees e on e.id = a.employee_id
                     where a.work_date = current_date and a.status = 'absent' and not a.is_rest_day and e.archived_at is null and (scope is null or e.department_id = any(scope))),
    'with_open_disclosures', (select count(*) from jsonb_array_elements(rows) r where (r ->> 'open_disclosures')::int > 0));
  return jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'department', dept_name, 'scoped', scope is not null, 'summary', summary, 'rows', rows);
end$$;
grant execute on function public.garage_employees(text, date) to authenticated;
