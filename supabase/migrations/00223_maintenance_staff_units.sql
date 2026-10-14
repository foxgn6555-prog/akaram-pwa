-- 00223 · بوابة الصيانة: وحدات «الموظفون» و«الطلبات» و«الإجراءات» — الصيانة ترى موظفي قسمها فقط
-- نفس آلية الكراج (00206–00209) والمحطة (00211–00213): النطاق = قسم حساب الصيانة في الموارد البشرية وفروعه (app.disclosure_scope_depts()).
-- حساب صيانة بلا سجل موظف/قسم ⇒ MAINTENANCE_NO_DEPARTMENT. لا رواتب ولا بيانات حساسة؛ التعيين الأساسي برقم M-xxxx داخل هيكل قسمها؛
-- إنهاء الخدمة عبر سلسلة الموافقات (الدور الإجرائي 'maintenance' — موجود أصلاً كطالب في سلاسل التطوير المركزية).
-- الدوال أدناه هي آخر نسخها (00211/00212/00213) مع إضافة دور maintenance فقط.

create or replace function app.disclosure_scope_depts() returns uuid[] language plpgsql stable security definer set search_path = public, app as $$
declare root uuid; station boolean; maint boolean;
begin
  if app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then return null; end if;
  station := app.has_role(array['transfer_station']);
  maint := app.has_role(array['maintenance']);   -- 00223
  if not (station or maint or app.has_role(array['central_garage_officer'])) then return null; end if;
  select e.department_id into root from public.employees e where e.user_id = auth.uid() and e.archived_at is null order by e.created_at desc limit 1;
  if root is null then
    if station then raise exception 'STATION_NO_DEPARTMENT'; end if;
    if maint then raise exception 'MAINTENANCE_NO_DEPARTMENT'; end if;
    raise exception 'GARAGE_NO_DEPARTMENT';
  end if;
  return (with recursive t as (select id from public.departments where id = root
                               union all select d.id from public.departments d join t on d.parent_id = t.id)
          select array_agg(id) from t);
end$$;

create or replace function public.garage_employees(p_q text default null, p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare scope uuid[]; m date := date_trunc('month', coalesce(p_month, current_date))::date; q text := nullif(trim(coalesce(p_q, '')), '');
        dept_name text; rows jsonb; summary jsonb;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
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

create or replace function app.garage_can_act_on(p_employee uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare scope uuid[];
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance']) then return false; end if;
  scope := app.disclosure_scope_depts();
  if scope is null then return true; end if;
  return exists (select 1 from public.employees e where e.id = p_employee and e.archived_at is null and e.department_id = any(scope));
end$$;

drop function if exists public.hr_leaves_list(text, date, date, text, uuid, text, int);
create or replace function public.hr_leaves_list(p_scope text, p_from date default null, p_to date default null, p_status text default null, p_department uuid default null, p_search text default null, p_limit int default 500)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean,
              start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, status text, notes text, attachment_path text,
              manager_id uuid, manager_name text, requested_by uuid, decided_at timestamptz, decision_note text, cancelled_reason text, created_at timestamptz, can_decide boolean,
              is_backdated boolean, backdated_reason text, backdated_days int, can_cancel boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id(); g_scope uuid[];
begin
  if p_scope = 'garage' then
    if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
    g_scope := app.disclosure_scope_depts();
  end if;
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id)), l.is_backdated, l.backdated_reason, l.backdated_days,
         (l.status = 'pending' and (l.requested_by = auth.uid() or app.has_role(array['hr_officer', 'super_admin']) or app.hr_can_decide(l.id)))
  from public.hr_leaves l
  join public.employees e on e.id = l.employee_id
  left join public.employees m on m.id = l.manager_id
  left join public.departments d on d.id = e.department_id
  left join public.hr_leave_types lt on lt.id = l.leave_type_id
  where case p_scope
          when 'mine' then l.employee_id = me
          when 'team' then (l.manager_id = me or e.manager_id = me or app.hr_can_decide(l.id))
          when 'garage' then (g_scope is null or e.department_id = any(g_scope))
          else app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) end
    and (p_from is null or l.end_date >= p_from) and (p_to is null or l.start_date <= p_to)
    and (p_status is null or l.status = p_status)
    and (p_department is null or e.department_id = p_department or e.department_id in (select dd.id from public.departments dd where dd.parent_id = p_department))
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by (l.status = 'pending') desc, l.created_at desc
  limit p_limit;
end$$;
grant execute on function public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;

create or replace function public.garage_leaves_summary() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[]; v_today date := app.hr_local_date(now()); r jsonb;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  select jsonb_build_object(
    'pending',        count(*) filter (where l.status = 'pending'),
    'my_decisions',   count(*) filter (where l.status = 'pending' and app.hr_can_decide(l.id)),
    'on_leave_today', count(*) filter (where l.status = 'approved' and l.kind = 'leave' and l.start_date <= v_today and l.end_date >= v_today),
    'permits_month',  count(*) filter (where l.status = 'approved' and l.kind = 'time_permit' and date_trunc('month', l.start_date) = date_trunc('month', v_today)),
    'scoped',         g_scope is not null)
  into r
  from public.hr_leaves l join public.employees e on e.id = l.employee_id
  where e.archived_at is null and (g_scope is null or e.department_id = any(g_scope))
    and l.end_date >= v_today - 60;
  return r;
end$$;
grant execute on function public.garage_leaves_summary() to authenticated;

create or replace function app.procedure_role() returns text language sql stable security definer set search_path = public, app as $$
  select case
    when app.has_role(array['super_admin','executive_director']) then 'executive_director'
    when app.has_role(array['deputy_director']) then 'deputy_director'
    when app.has_role(array['field_ops']) then 'field_ops'
    when app.has_role(array['admin_ops']) then 'admin_ops'
    when app.has_role(array['central_garage_officer']) then 'garage'   -- 00209
    when app.has_role(array['transfer_station']) then 'station'        -- 00213
    when app.has_role(array['maintenance']) then 'maintenance'         -- 00223
    else null end $$;

create or replace function app.procedures_link_for(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then '/admin/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'executive_director') then '/executive/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then '/deputy/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'field_ops') then '/field-ops/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'central_garage_officer') then '/central-garage/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'transfer_station') then '/transfer-station/procedures'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'maintenance') then '/maintenance/procedures'
    else '/notifications' end $$;

create or replace function public.termination_targets()
returns table(target_kind text, employee_id uuid, worker_id uuid, user_id uuid, full_name text, label text, scope text, employee_number text)
language plpgsql stable security definer set search_path = public, app as $$
declare r text := app.procedure_role(); parents text[]; g_scope uuid[];
begin
  if r is null then raise exception 'PROCEDURE_FORBIDDEN'; end if;
  parents := case when r = 'admin_ops' then coalesce((select p.parent_sectors from public.sector_manager_profiles p where p.user_id = auth.uid()), '{}')
                  else (select coalesce(array_agg(distinct s.parent_sector), '{}') from public.sectors s where s.parent_sector is not null) end;
  if r = 'admin_ops' and cardinality(parents) = 0 then raise exception 'SECTOR_MANAGER_NOT_ASSIGNED'; end if;
  if r in ('garage','station','maintenance') then parents := '{}'; g_scope := app.disclosure_scope_depts(); end if;   -- 00213: الكراج/المحطة ⇒ قسمه وفروعه فقط   -- 00209: الكراج ⇒ موظفو قسمه وفروعه فقط (بلا عمال)
  return query
  with emp as (
    select e.id, e.user_id, e.full_name, e.employee_number, e.job_title,
      (select array_agg(ur.role) from public.user_roles ur where ur.user_id = e.user_id) as roles
    from public.employees e where e.employment_status <> 'terminated' and e.archived_at is null and e.user_id is distinct from auth.uid()
  ),
  dm as (  -- مسؤولو الأقسام في النطاق
    select distinct mp.user_id, s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(parents)
  ),
  ct as (  -- المتعهدون في النطاق
    select cp.user_id, s.parent_sector, s.name as area from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(parents)
  )
  -- موظفون
  select 'employee', e.id, null::uuid, e.user_id, e.full_name,
    case when exists (select 1 from dm where dm.user_id = e.user_id) then 'مسؤول قسم · ' || (select string_agg(distinct app.parent_sector_name(dm.parent_sector), '، ') from dm where dm.user_id = e.user_id)
         when exists (select 1 from ct where ct.user_id = e.user_id) then 'متعهد · ' || (select string_agg(ct.area, '، ') from ct where ct.user_id = e.user_id)
         when 'admin_ops' = any(e.roles) then 'مسؤول قاطع · ' || coalesce((select string_agg(app.parent_sector_name(x), '، ') from public.sector_manager_profiles p, unnest(p.parent_sectors) x where p.user_id = e.user_id), '')
         when 'central_garage_officer' = any(e.roles) then 'الكراج المركزي' || coalesce(' · ' || e.job_title, '')
         when 'transfer_station' = any(e.roles) then 'المحطة التحويلية' || coalesce(' · ' || e.job_title, '')
         when 'maintenance' = any(e.roles) then 'الصيانة' || coalesce(' · ' || e.job_title, '')
         else coalesce(e.job_title, 'موظف') end,
    case when exists (select 1 from dm where dm.user_id = e.user_id) then 'department_manager'
         when exists (select 1 from ct where ct.user_id = e.user_id) then 'contractor'
         when 'admin_ops' = any(e.roles) then 'admin_ops'
         when 'central_garage_officer' = any(e.roles) then 'garage'
         when 'transfer_station' = any(e.roles) then 'station'
         when 'maintenance' = any(e.roles) then 'maintenance' else 'other' end,
    e.employee_number
  from emp e
  where case r
    when 'admin_ops' then exists (select 1 from dm where dm.user_id = e.user_id) or exists (select 1 from ct where ct.user_id = e.user_id)
    when 'field_ops' then exists (select 1 from dm where dm.user_id = e.user_id) or exists (select 1 from ct where ct.user_id = e.user_id)
                          or e.roles && array['admin_ops','central_garage_officer','transfer_station','maintenance']
    when 'deputy_director' then not (coalesce(e.roles, '{}') && array['executive_director','super_admin'])
    when 'garage' then exists (select 1 from public.employees ge where ge.id = e.id and (g_scope is null or ge.department_id = any(g_scope)))
    when 'station' then exists (select 1 from public.employees ge where ge.id = e.id and (g_scope is null or ge.department_id = any(g_scope)))
    when 'maintenance' then exists (select 1 from public.employees ge where ge.id = e.id and (g_scope is null or ge.department_id = any(g_scope)))
    else true end
  union all
  -- عمال المتعهدين
  select 'worker', null::uuid, w.id, null::uuid, w.full_name, 'عامل · ' || app.manager_display_name(w.contractor_user_id) || ' · ' || s.name, 'worker', null
  from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active join public.sectors s on s.id = cp.sector_id
  where w.is_active and s.parent_sector = any(parents)
  order by 7, 5;
end$$;

create or replace function public.garage_hire_options() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[]; pfx text := case when app.has_role(array['central_garage_officer']) then 'G-' when app.has_role(array['transfer_station']) then 'S-' when app.has_role(array['maintenance']) then 'M-' else 'G-' end;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  return jsonb_build_object(
    'job_titles', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'department_id', p.id, 'department', p.name, 'drives_vehicles', t.drives_vehicles) order by p.name, t.name)
                            from public.departments t join public.departments p on p.id = t.parent_id
                            where t.is_job_title and t.is_active and t.archived_at is null and (g_scope is null or p.id = any(g_scope))), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'start_time', to_char(s.start_time, 'HH24:MI'), 'end_time', to_char(s.end_time, 'HH24:MI')) order by s.start_time)
                        from public.hr_shifts s where s.is_active), '[]'::jsonb),
    'next_employee_number', (select pfx || lpad((coalesce(max(nullif(regexp_replace(e.employee_number, '\D', '', 'g'), ''))::bigint, 0) + 1)::text, 4, '0') from public.employees e where e.employee_number ~ ('^' || pfx || '\d+$')),
    'scoped', g_scope is not null);
end$$;
grant execute on function public.garage_hire_options() to authenticated;

create or replace function public.garage_employee_hire(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare g_scope uuid[]; v_src text := case when app.has_role(array['central_garage_officer']) then 'garage' when app.has_role(array['transfer_station']) then 'station' when app.has_role(array['maintenance']) then 'maintenance' else 'garage' end; v_src_ar text; v_title public.departments; v_id uuid; v_shift uuid; v_contract text := coalesce(nullif(p ->> 'contract_type', ''), 'monthly'); v_hire date := coalesce((p ->> 'hire_date')::date, current_date); u uuid; v_no text;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  v_src_ar := case v_src when 'station' then 'المحطة التحويلية' when 'maintenance' then 'الصيانة' else 'الكراج' end;
  -- حقول حساسة ممنوعة من الكراج (الموارد البشرية فقط) — أي محاولة تُرفض صراحةً
  if p ?| array['biometric_pin','national_id_number','residence_card_number','mother_name','birth_date','address','base_salary','salary','allowances','email','manager_id'] then raise exception 'GARAGE_SENSITIVE_FIELD_FORBIDDEN'; end if;
  if length(trim(coalesce(p ->> 'full_name', ''))) < 3 then raise exception 'HR_NAME_REQUIRED'; end if;
  v_no := trim(coalesce(p ->> 'employee_number', ''));
  if v_no = '' then raise exception 'HR_NUMBER_REQUIRED'; end if;
  if exists (select 1 from public.employees where employee_number = v_no) then raise exception 'HR_NUMBER_TAKEN'; end if;
  if v_contract not in ('monthly', 'daily') then raise exception 'HR_CONTRACT_TYPE_INVALID'; end if;
  select * into v_title from public.departments where id = nullif(p ->> 'job_title_id', '')::uuid and is_job_title and is_active and archived_at is null;
  if v_title.id is null then raise exception 'HR_JOB_TITLE_INVALID'; end if;
  if g_scope is not null and not (v_title.parent_id = any(g_scope)) then raise exception 'GARAGE_JOB_TITLE_OUT_OF_SCOPE'; end if;
  v_shift := nullif(p ->> 'shift_id', '')::uuid;
  if v_shift is not null and not exists (select 1 from public.hr_shifts where id = v_shift and is_active) then raise exception 'HR_SHIFT_INVALID'; end if;

  insert into public.employees (employee_number, full_name, phone, job_title_id, hire_date, contract_type)
  values (v_no, trim(p ->> 'full_name'), nullif(trim(coalesce(p ->> 'phone', '')), ''), v_title.id, v_hire, v_contract)
  returning id into v_id;
  if v_shift is not null then
    insert into public.employee_shift_assignments (employee_id, shift_id, effective_from, created_by) values (v_id, v_shift, v_hire, auth.uid());
  end if;
  -- الراتب: المالية فقط (كما في hr_employee_create)
  insert into public.employee_salary_profiles (employee_id, status, pay_type) values (v_id, 'pending', v_contract);
  insert into public.finance_hr_notices (employee_id, kind, payload) values (v_id, 'salary_pending', jsonb_build_object('contract_type', v_contract, 'source', v_src));
  -- الموارد البشرية: إكمال الملف (البصمة والبيانات الشخصية)
  for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
    perform app.hr_notify(u, 'تعيين جديد من ' || v_src_ar || ': ' || trim(p ->> 'full_name'), 'الرقم ' || v_no || ' · ' || v_title.name || ' · مباشرة ' || v_hire::text || ' — أكملوا الملف (رقم البصمة، البيانات الشخصية، المدير المباشر)', '/hr/employees/' || v_id::text, 'garage_hire:' || v_id::text, 'info');
  end loop;
  return jsonb_build_object('id', v_id, 'employee_number', v_no, 'full_name', trim(p ->> 'full_name'), 'job_title', v_title.name, 'department_id', v_title.parent_id, 'is_driver', v_title.drives_vehicles, 'hire_date', v_hire, 'contract_type', v_contract);
end$$;
grant execute on function public.garage_employee_hire(jsonb) to authenticated;

create or replace function public.garage_recent_hires(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[];
begin
  if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'job_title', e.job_title, 'is_driver', e.is_driver,
                                     'hire_date', e.hire_date, 'contract_type', e.contract_type, 'employment_status', e.employment_status,
                                     'has_biometric', e.biometric_pin is not null, 'has_manager', e.manager_id is not null,
                                     'salary_ready', exists (select 1 from public.employee_salary_profiles sp where sp.employee_id = e.id and sp.status <> 'pending')) order by e.hire_date desc, e.created_at desc)
                   from (select * from public.employees x where x.archived_at is null and (g_scope is null or x.department_id = any(g_scope)) and x.hire_date >= current_date - 180
                         order by x.hire_date desc, x.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) e), '[]'::jsonb);
end$$;
grant execute on function public.garage_recent_hires(int) to authenticated;
