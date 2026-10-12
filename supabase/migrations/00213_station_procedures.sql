-- 00213 · المحطة التحويلية — وحدة «الإجراءات» (الجولة 3 من 5): نفس آلية الكراج (00209) لدور transfer_station
-- الدور الإجرائي 'station' = موظفو قسم المحطة وفروعه فقط؛ التعيين الأساسي داخل هيكل قسمها (رقم S-xxxx)؛ الحساسة للموارد البشرية والراتب للمالية.
-- إنهاء الخدمة: الكراج طالبٌ جديد في وحدة الإجراءات (00163) بنطاق = موظفو قسمه وفروعه؛ لا يُنفَّذ قبل سلسلة الموافقات (دور central_garage_officer في التطوير المركزية) أو موافقة HR افتراضياً.
-- التعيين: الكراج يُنشئ سجل الموظف بالبيانات الأساسية فقط (الاسم، الرقم الوظيفي، الهاتف، المسمى من هيكل قسمه، تاريخ المباشرة، نوع العقد، الشفت).
--   الحساسة (رقم البصمة، السماحيات، الهوية، العنوان…) للموارد البشرية فقط — تُبلَّغ لإكمال الملف. الراتب للمالية فقط — إشعار «راتب معلّق» كما في hr_employee_create.

-- ① الدور الإجرائي + الرابط + الأهداف
create or replace function app.procedure_role() returns text language sql stable security definer set search_path = public, app as $$
  select case
    when app.has_role(array['super_admin','executive_director']) then 'executive_director'
    when app.has_role(array['deputy_director']) then 'deputy_director'
    when app.has_role(array['field_ops']) then 'field_ops'
    when app.has_role(array['admin_ops']) then 'admin_ops'
    when app.has_role(array['central_garage_officer']) then 'garage'   -- 00209
    when app.has_role(array['transfer_station']) then 'station'        -- 00213
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
  if r in ('garage','station') then parents := '{}'; g_scope := app.disclosure_scope_depts(); end if;   -- 00213: الكراج/المحطة ⇒ قسمه وفروعه فقط   -- 00209: الكراج ⇒ موظفو قسمه وفروعه فقط (بلا عمال)
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
    else true end
  union all
  -- عمال المتعهدين
  select 'worker', null::uuid, w.id, null::uuid, w.full_name, 'عامل · ' || app.manager_display_name(w.contractor_user_id) || ' · ' || s.name, 'worker', null
  from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active join public.sectors s on s.id = cp.sector_id
  where w.is_active and s.parent_sector = any(parents)
  order by 7, 5;
end$$;


-- ② التعيين الأساسي من الكراج
create or replace function public.garage_hire_options() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[]; pfx text := case when app.has_role(array['transfer_station']) and not app.has_role(array['central_garage_officer']) then 'S-' else 'G-' end;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','ops_room','hr_officer','it_admin','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
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
declare g_scope uuid[]; v_src text := case when app.has_role(array['transfer_station']) and not app.has_role(array['central_garage_officer']) then 'station' else 'garage' end; v_src_ar text; v_title public.departments; v_id uuid; v_shift uuid; v_contract text := coalesce(nullif(p ->> 'contract_type', ''), 'monthly'); v_hire date := coalesce((p ->> 'hire_date')::date, current_date); u uuid; v_no text;
begin
  if not app.has_role(array['central_garage_officer','transfer_station','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  v_src_ar := case v_src when 'station' then 'المحطة التحويلية' else 'الكراج' end;
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

-- ③ سجل تعيينات الكراج (للمتابعة) — بلا حقول حساسة
create or replace function public.garage_recent_hires(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[];
begin
  if not app.has_role(array['central_garage_officer','transfer_station','ops_room','hr_officer','it_admin','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'job_title', e.job_title, 'is_driver', e.is_driver,
                                     'hire_date', e.hire_date, 'contract_type', e.contract_type, 'employment_status', e.employment_status,
                                     'has_biometric', e.biometric_pin is not null, 'has_manager', e.manager_id is not null,
                                     'salary_ready', exists (select 1 from public.employee_salary_profiles sp where sp.employee_id = e.id and sp.status <> 'pending')) order by e.hire_date desc, e.created_at desc)
                   from (select * from public.employees x where x.archived_at is null and (g_scope is null or x.department_id = any(g_scope)) and x.hire_date >= current_date - 180
                         order by x.hire_date desc, x.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) e), '[]'::jsonb);
end$$;
grant execute on function public.garage_recent_hires(int) to authenticated;
