-- 00390 — ملف الموظف: تعديل المدير المباشر (مع منع الحلقات)، نوع العقد (شهري/يومي)، حالة التوظيف (فعّال/إجازة طويلة/موقوف)
-- + قائمة المدراء المرشحين + تدقيق التغييرات الحساسة. نسخة محدّثة من hr_employee_update (00153) بلا تغيير في بقية الحقول.
create or replace function public.hr_employee_update(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, app as $$
declare k text; v_title uuid; v_mgr uuid; v_cur record; v_changes jsonb := '{}'::jsonb; allowed text[] := array['full_name','email','phone','phone2','department_id','branch_id','manager_id','job_title_id','hire_date','mother_name','gender',
  'birth_date','birth_place','marital_status','education','national_id_number','residence_card_number','governorate','address','emergency_contact_name',
  'emergency_contact_phone','blood_type','biometric_pin','photo_path','contract_type','employment_status'];   -- 00390: + نوع العقد وحالة التوظيف
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p ? 'job_title' then raise exception 'HR_JOB_TITLE_FREE_TEXT_FORBIDDEN'; end if;
  for k in select jsonb_object_keys(p) loop
    if not (k = any (allowed)) then raise exception 'HR_FIELD_NOT_ALLOWED: %', k; end if;
  end loop;
  if (p ->> 'biometric_pin') is not null and exists (select 1 from public.employees where biometric_pin = trim(p ->> 'biometric_pin') and id <> p_id) then raise exception 'BIO_PIN_TAKEN'; end if;
  select id, manager_id, contract_type, employment_status, full_name into v_cur from public.employees where id = p_id;
  if v_cur.id is null then raise exception 'HR_NOT_FOUND'; end if;
  -- 00390: المدير المباشر — لا يكون الموظف مدير نفسه، ولا يُنشئ حلقة (مديره أحد مرؤوسيه)، ويجب أن يكون موظفًا فعّالًا غير مؤرشف
  if p ? 'manager_id' then
    v_mgr := nullif(p ->> 'manager_id', '')::uuid;
    if v_mgr is not null then
      if v_mgr = p_id then raise exception 'HR_MANAGER_SELF'; end if;
      if not exists (select 1 from public.employees m where m.id = v_mgr and m.archived_at is null and m.employment_status <> 'terminated') then raise exception 'HR_MANAGER_INVALID'; end if;
      if exists (
        with recursive up as (select m.id, m.manager_id, 1 as depth from public.employees m where m.id = v_mgr
                              union all select m.id, m.manager_id, up.depth + 1 from public.employees m join up on m.id = up.manager_id where up.depth < 50)
        select 1 from up where up.manager_id = p_id) then raise exception 'HR_MANAGER_CYCLE'; end if;
    end if;
    if v_mgr is distinct from v_cur.manager_id then v_changes := v_changes || jsonb_build_object('manager_id', jsonb_build_object('from', v_cur.manager_id, 'to', v_mgr)); end if;
  end if;
  -- 00390: نوع العقد (شهري/يومي) — يؤثر على الرواتب ⇒ يُسجَّل في التدقيق
  if p ? 'contract_type' then
    if (p ->> 'contract_type') not in ('monthly', 'daily') then raise exception 'HR_CONTRACT_TYPE_INVALID'; end if;
    if (p ->> 'contract_type') <> v_cur.contract_type then v_changes := v_changes || jsonb_build_object('contract_type', jsonb_build_object('from', v_cur.contract_type, 'to', p ->> 'contract_type')); end if;
  end if;
  -- 00390: حالة التوظيف — فعّال/إجازة طويلة/موقوف فقط؛ إنهاء الخدمة له مساره الخاص (hr_terminate_employee) ولا يُلغى من هنا
  if p ? 'employment_status' then
    if (p ->> 'employment_status') not in ('active', 'on_leave', 'suspended') then raise exception 'HR_EMPLOYMENT_STATUS_INVALID'; end if;
    if v_cur.employment_status = 'terminated' then raise exception 'HR_EMPLOYEE_TERMINATED'; end if;
    if (p ->> 'employment_status') <> v_cur.employment_status then v_changes := v_changes || jsonb_build_object('employment_status', jsonb_build_object('from', v_cur.employment_status, 'to', p ->> 'employment_status')); end if;
  end if;
  if p ? 'job_title_id' then
    v_title := nullif(p ->> 'job_title_id', '')::uuid;
    if v_title is not null and not exists (select 1 from public.departments where id = v_title and is_job_title and is_active and archived_at is null) then raise exception 'HR_JOB_TITLE_INVALID'; end if;
  end if;
  update public.employees set
    full_name = coalesce(nullif(trim(p ->> 'full_name'), ''), full_name),
    email = case when p ? 'email' then nullif(trim(p ->> 'email'), '') else email end,
    phone = case when p ? 'phone' then nullif(trim(p ->> 'phone'), '') else phone end,
    phone2 = case when p ? 'phone2' then nullif(trim(p ->> 'phone2'), '') else phone2 end,
    -- القسم يُشتق من المسمى عند وجوده؛ وإلا يُقبل التعديل المباشر
    department_id = case when p ? 'department_id' and coalesce(v_title, job_title_id) is null then nullif(p ->> 'department_id', '')::uuid else department_id end,
    branch_id = case when p ? 'branch_id' then nullif(p ->> 'branch_id', '')::uuid else branch_id end,
    manager_id = case when p ? 'manager_id' then nullif(p ->> 'manager_id', '')::uuid else manager_id end,
    job_title_id = case when p ? 'job_title_id' then v_title else job_title_id end,
    hire_date = case when p ? 'hire_date' then (p ->> 'hire_date')::date else hire_date end,
    mother_name = case when p ? 'mother_name' then nullif(trim(p ->> 'mother_name'), '') else mother_name end,
    gender = case when p ? 'gender' then nullif(p ->> 'gender', '') else gender end,
    birth_date = case when p ? 'birth_date' then (p ->> 'birth_date')::date else birth_date end,
    birth_place = case when p ? 'birth_place' then nullif(trim(p ->> 'birth_place'), '') else birth_place end,
    marital_status = case when p ? 'marital_status' then nullif(p ->> 'marital_status', '') else marital_status end,
    education = case when p ? 'education' then nullif(trim(p ->> 'education'), '') else education end,
    national_id_number = case when p ? 'national_id_number' then nullif(trim(p ->> 'national_id_number'), '') else national_id_number end,
    residence_card_number = case when p ? 'residence_card_number' then nullif(trim(p ->> 'residence_card_number'), '') else residence_card_number end,
    governorate = case when p ? 'governorate' then nullif(trim(p ->> 'governorate'), '') else governorate end,
    address = case when p ? 'address' then nullif(trim(p ->> 'address'), '') else address end,
    emergency_contact_name = case when p ? 'emergency_contact_name' then nullif(trim(p ->> 'emergency_contact_name'), '') else emergency_contact_name end,
    emergency_contact_phone = case when p ? 'emergency_contact_phone' then nullif(trim(p ->> 'emergency_contact_phone'), '') else emergency_contact_phone end,
    blood_type = case when p ? 'blood_type' then nullif(p ->> 'blood_type', '') else blood_type end,
    biometric_pin = case when p ? 'biometric_pin' then nullif(trim(p ->> 'biometric_pin'), '') else biometric_pin end,
    photo_path = case when p ? 'photo_path' then nullif(trim(p ->> 'photo_path'), '') else photo_path end,
    contract_type = case when p ? 'contract_type' then p ->> 'contract_type' else contract_type end,
    employment_status = case when p ? 'employment_status' then p ->> 'employment_status' else employment_status end,
    updated_at = now()
  where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if v_changes <> '{}'::jsonb then
    insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
    values ('employees', p_id::text, 'UPDATE', v_changes || jsonb_build_object('employee', v_cur.full_name, 'kind', 'hr_sensitive_update'), auth.uid(), app.current_role());
  end if;
end$$;
grant execute on function public.hr_employee_update(uuid, jsonb) to authenticated;

-- ─── الاستيراد: عمود المسمى يُطابَق بالاسم مع مسميات الهيكل؛ غير المطابق يُستورد بلا مسمى مع تحذير ───

-- قائمة المرشحين للمدير المباشر (موظفون فعّالون غير مؤرشفين، يستثني الموظف نفسه ومرؤوسيه كي لا تُعرض حلقة أصلًا)
create or replace function public.hr_manager_candidates(p_employee uuid, p_q text default null)
returns table(id uuid, employee_number text, full_name text, job_title text, department_name text)
language sql stable security definer set search_path = public, app as $$
  with recursive down as (
    select e.id from public.employees e where e.manager_id = p_employee
    union all select e.id from public.employees e join down on e.manager_id = down.id)
  select e.id, e.employee_number, e.full_name, e.job_title, d.name
  from public.employees e left join public.departments d on d.id = e.department_id
  where app.has_role(array['hr_officer', 'super_admin'])
    and e.archived_at is null and e.employment_status <> 'terminated' and e.id <> p_employee and e.id not in (select id from down)
    and (p_q is null or p_q = '' or e.full_name ilike '%' || p_q || '%' or e.employee_number ilike '%' || p_q || '%')
  order by e.full_name limit 50
$$;
revoke all on function public.hr_manager_candidates(uuid, text) from public, anon;
grant execute on function public.hr_manager_candidates(uuid, text) to authenticated;
