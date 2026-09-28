-- ═══════════════════════════════════════════════════════════════
-- 00153 · المسميات الوظيفية من الهيكل التنظيمي (لا نص حر)
--   الشجرة: الشركة ← قسم أب ← عقد فرعية؛ العقدة الفرعية المعلَّمة is_job_title هي «المسمى الوظيفي».
--   الموظف يُعيَّن على مسمى (employees.job_title_id) فيُشتق تلقائياً: job_title (نص للتقارير)، department_id (الأب)،
--   is_driver (من خانة المسمى drives_vehicles «يقود آليات الشركة»).
--   · لا يجوز إدخال job_title نصاً حراً عبر أي RPC (HR_JOB_TITLE_FREE_TEXT_FORBIDDEN)؛ trigger يضمن الاشتقاق حتى لو كُتب مباشرة.
--   · غرفة العمليات ترى في قائمة السائقين فقط موظفي المسميات التي تقود آليات.
--   · القيم النصية القديمة تُفرَّغ (قرار المستخدم) ويظهر الموظف «بلا مسمى» حتى تعيّنه HR.
-- ═══════════════════════════════════════════════════════════════

alter table public.departments add column if not exists is_job_title boolean not null default false;
alter table public.departments add column if not exists drives_vehicles boolean not null default false;
comment on column public.departments.is_job_title is 'عقدة فرعية تمثل مسمى وظيفياً (لا قسماً)؛ يجب أن يكون لها قسم أب وليس لها فروع';
comment on column public.departments.drives_vehicles is 'هذا المسمى يقود آليات الشركة — موظفوه يظهرون في قائمة سائقي غرفة العمليات';
alter table public.departments drop constraint if exists departments_drives_requires_title;
alter table public.departments add constraint departments_drives_requires_title check (not drives_vehicles or is_job_title);

alter table public.employees add column if not exists job_title_id uuid references public.departments(id);
create index if not exists employees_job_title_idx on public.employees(job_title_id);
comment on column public.employees.job_title_id is 'المسمى الوظيفي من الهيكل التنظيمي؛ job_title و department_id و is_driver تُشتق منه';

-- ─── الاشتقاق على الموظف ───
create or replace function app.derive_employee_job_title() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare t public.departments;
begin
  if new.job_title_id is not null then
    select * into t from public.departments where id = new.job_title_id;
    if not found or not t.is_job_title then raise exception 'HR_JOB_TITLE_INVALID'; end if;
    if tg_op = 'INSERT' or new.job_title_id is distinct from old.job_title_id then
      if not t.is_active or t.archived_at is not null then raise exception 'HR_JOB_TITLE_INACTIVE'; end if;
    end if;
    new.job_title := t.name;
    new.department_id := t.parent_id;
    new.is_driver := t.drives_vehicles;
  else
    new.job_title := null;
    new.is_driver := false;
  end if;
  return new;
end$$;
drop trigger if exists trg_derive_employee_job_title on public.employees;
create trigger trg_derive_employee_job_title before insert or update on public.employees
for each row execute function app.derive_employee_job_title();

-- ─── انتشار تعديل المسمى إلى موظفيه ───
create or replace function app.propagate_job_title_change() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.name is distinct from old.name or new.parent_id is distinct from old.parent_id or new.drives_vehicles is distinct from old.drives_vehicles then
    update public.employees set job_title = new.name, department_id = new.parent_id, is_driver = new.drives_vehicles, updated_at = now()
     where job_title_id = new.id;
  end if;
  return new;
end$$;
drop trigger if exists trg_propagate_job_title_change on public.departments;
create trigger trg_propagate_job_title_change after update on public.departments
for each row when (new.is_job_title) execute function app.propagate_job_title_change();

-- ─── تفريغ القيم النصية القديمة (قرار: إعادة التعيين من الهيكل) ───
update public.employees set job_title = null, is_driver = false where job_title_id is null and (job_title is not null or is_driver);

-- ─── الهيكل: العرض والحفظ ───
drop function if exists public.hr_departments_overview();
create function public.hr_departments_overview()
returns table(id uuid, name text, code text, parent_id uuid, is_active boolean, manager_id uuid, manager_name text,
              employees_active int, employees_total int, children int, created_at timestamptz, is_job_title boolean, drives_vehicles boolean)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.name, d.code, d.parent_id, d.is_active, d.manager_id, m.full_name,
    (select count(*)::int from public.employees e where e.employment_status <> 'terminated' and e.archived_at is null
        and (case when d.is_job_title then e.job_title_id = d.id else e.department_id = d.id end)),
    (select count(*)::int from public.employees e where (case when d.is_job_title then e.job_title_id = d.id else e.department_id = d.id end)),
    (select count(*)::int from public.departments c where c.parent_id = d.id and c.is_active),
    d.created_at, d.is_job_title, d.drives_vehicles
  from public.departments d
  left join public.employees m on m.id = d.manager_id
  where d.archived_at is null and app.has_role(array['hr_officer', 'super_admin', 'it_admin'])
  order by d.name;
$$;
grant execute on function public.hr_departments_overview() to authenticated;

drop function if exists public.hr_department_save(uuid, text, text, uuid, boolean, uuid);
create function public.hr_department_save(p_id uuid, p_name text, p_code text, p_parent uuid, p_is_active boolean default true, p_manager uuid default null,
                                          p_is_job_title boolean default false, p_drives_vehicles boolean default false)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid := p_id; v_cur uuid; v_n int; v_code text := upper(trim(coalesce(p_code, ''))); v_title boolean := coalesce(p_is_job_title, false);
        v_drives boolean := coalesce(p_drives_vehicles, false) and coalesce(p_is_job_title, false); parent_rec public.departments;
begin
  if not app.has_role(array['hr_officer', 'super_admin', 'it_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'HR_DEPT_NAME_REQUIRED'; end if;
  if v_code = '' then raise exception 'HR_DEPT_CODE_REQUIRED'; end if;
  if exists (select 1 from public.departments d where d.code = v_code and (p_id is null or d.id <> p_id)) then raise exception 'HR_DEPT_CODE_TAKEN'; end if;
  if p_parent is not null then
    if p_id is not null and p_parent = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
    select * into parent_rec from public.departments where id = p_parent and archived_at is null;
    if not found then raise exception 'HR_DEPT_PARENT_INVALID'; end if;
    -- المسمى الوظيفي لا يكون أباً لأي عقدة
    if parent_rec.is_job_title then raise exception 'HR_DEPT_PARENT_IS_JOB_TITLE'; end if;
    if p_id is not null then
      v_cur := p_parent;
      for v_n in 1..64 loop
        exit when v_cur is null;
        if v_cur = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
        select parent_id into v_cur from public.departments where id = v_cur;
      end loop;
    end if;
  end if;
  -- المسمى الوظيفي يجب أن يتفرع من قسم أب
  if v_title and p_parent is null then raise exception 'HR_JOB_TITLE_PARENT_REQUIRED'; end if;
  -- اسم المسمى فريد داخل القسم الأب
  if v_title and exists (select 1 from public.departments d where d.parent_id = p_parent and d.is_job_title and d.archived_at is null
                          and lower(trim(d.name)) = lower(trim(p_name)) and (p_id is null or d.id <> p_id)) then raise exception 'HR_JOB_TITLE_NAME_TAKEN'; end if;
  if p_manager is not null and not exists (select 1 from public.employees where id = p_manager and employment_status <> 'terminated') then raise exception 'HR_DEPT_MANAGER_INVALID'; end if;

  if p_id is null then
    insert into public.departments (name, code, parent_id, is_active, manager_id, is_job_title, drives_vehicles)
    values (trim(p_name), v_code, p_parent, coalesce(p_is_active, true), p_manager, v_title, v_drives) returning id into v_id;
  else
    if not exists (select 1 from public.departments where id = p_id) then raise exception 'HR_NOT_FOUND'; end if;
    -- تحويل عقدة إلى مسمى: لا فروع لها؛ تحويل مسمى إلى قسم: لا موظفون عليه
    if v_title and exists (select 1 from public.departments where parent_id = p_id and archived_at is null) then raise exception 'HR_JOB_TITLE_HAS_CHILDREN'; end if;
    if not v_title and exists (select 1 from public.employees where job_title_id = p_id and employment_status <> 'terminated') then raise exception 'HR_JOB_TITLE_IN_USE'; end if;
    if p_is_active is false then
      if exists (select 1 from public.employees where (department_id = p_id or job_title_id = p_id) and employment_status <> 'terminated') then raise exception 'HR_DEPT_HAS_EMPLOYEES'; end if;
      if exists (select 1 from public.departments where parent_id = p_id and is_active) then raise exception 'HR_DEPT_HAS_CHILDREN'; end if;
    end if;
    update public.departments set name = trim(p_name), code = v_code, parent_id = p_parent, is_active = coalesce(p_is_active, true), manager_id = p_manager,
                                  is_job_title = v_title, drives_vehicles = v_drives, updated_at = now()
     where id = p_id;
  end if;
  return v_id;
end$$;
grant execute on function public.hr_department_save(uuid, text, text, uuid, boolean, uuid, boolean, boolean) to authenticated;

-- قائمة المسميات للاختيار (HR، غرفة العمليات، IT)
create or replace function public.hr_job_titles(p_include_inactive boolean default false)
returns table(id uuid, name text, code text, department_id uuid, department_name text, drives_vehicles boolean, is_active boolean, employees_active int)
language sql stable security definer set search_path = public, app as $$
  select t.id, t.name, t.code, p.id, p.name, t.drives_vehicles, t.is_active,
         (select count(*)::int from public.employees e where e.job_title_id = t.id and e.employment_status <> 'terminated' and e.archived_at is null)
  from public.departments t join public.departments p on p.id = t.parent_id
  where t.is_job_title and t.archived_at is null and (p_include_inactive or t.is_active)
    and app.has_role(array['hr_officer', 'super_admin', 'it_admin', 'ops_room', 'finance_officer'])
  order by p.name, t.name;
$$;
grant execute on function public.hr_job_titles(boolean) to authenticated;

-- ─── إنشاء/تعديل الموظف: المسمى بالمعرّف فقط ───
create or replace function public.hr_employee_create(p jsonb)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; v_shift uuid; v_title uuid;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' then raise exception 'HR_NAME_REQUIRED'; end if;
  if coalesce(trim(p ->> 'employee_number'), '') = '' then raise exception 'HR_NUMBER_REQUIRED'; end if;
  if exists (select 1 from public.employees where employee_number = trim(p ->> 'employee_number')) then raise exception 'HR_NUMBER_TAKEN'; end if;
  if (p ->> 'biometric_pin') is not null and exists (select 1 from public.employees where biometric_pin = trim(p ->> 'biometric_pin')) then raise exception 'BIO_PIN_TAKEN'; end if;
  if nullif(trim(coalesce(p ->> 'job_title', '')), '') is not null then raise exception 'HR_JOB_TITLE_FREE_TEXT_FORBIDDEN'; end if;
  v_title := nullif(p ->> 'job_title_id', '')::uuid;
  if v_title is not null and not exists (select 1 from public.departments where id = v_title and is_job_title and is_active and archived_at is null) then raise exception 'HR_JOB_TITLE_INVALID'; end if;

  insert into public.employees (employee_number, full_name, email, phone, phone2, department_id, branch_id, manager_id, job_title_id, hire_date,
    mother_name, gender, birth_date, birth_place, marital_status, education, national_id_number, residence_card_number, governorate, address,
    emergency_contact_name, emergency_contact_phone, blood_type, contract_type, biometric_pin)
  values (trim(p ->> 'employee_number'), trim(p ->> 'full_name'), nullif(trim(coalesce(p ->> 'email', '')), ''), nullif(trim(coalesce(p ->> 'phone', '')), ''),
    nullif(trim(coalesce(p ->> 'phone2', '')), ''), nullif(p ->> 'department_id', '')::uuid, nullif(p ->> 'branch_id', '')::uuid, nullif(p ->> 'manager_id', '')::uuid,
    v_title, coalesce((p ->> 'hire_date')::date, current_date),
    nullif(trim(coalesce(p ->> 'mother_name', '')), ''), nullif(p ->> 'gender', ''), (p ->> 'birth_date')::date, nullif(trim(coalesce(p ->> 'birth_place', '')), ''),
    nullif(p ->> 'marital_status', ''), nullif(trim(coalesce(p ->> 'education', '')), ''), nullif(trim(coalesce(p ->> 'national_id_number', '')), ''),
    nullif(trim(coalesce(p ->> 'residence_card_number', '')), ''), nullif(trim(coalesce(p ->> 'governorate', '')), ''), nullif(trim(coalesce(p ->> 'address', '')), ''),
    nullif(trim(coalesce(p ->> 'emergency_contact_name', '')), ''), nullif(trim(coalesce(p ->> 'emergency_contact_phone', '')), ''), nullif(p ->> 'blood_type', ''),
    coalesce(nullif(p ->> 'contract_type', ''), 'monthly'), nullif(trim(coalesce(p ->> 'biometric_pin', '')), ''))
  returning id into v_id;

  v_shift := nullif(p ->> 'shift_id', '')::uuid;
  if v_shift is not null then
    insert into public.employee_shift_assignments (employee_id, shift_id, effective_from, start_override, end_override, grace_override, created_by)
    values (v_id, v_shift, coalesce((p ->> 'hire_date')::date, current_date), (p ->> 'shift_start_override')::time, (p ->> 'shift_end_override')::time,
            (p ->> 'shift_grace_override')::int, auth.uid());
  end if;

  insert into public.employee_salary_profiles (employee_id, status, pay_type) values (v_id, 'pending', coalesce(nullif(p ->> 'contract_type', ''), 'monthly'));
  insert into public.finance_hr_notices (employee_id, kind, payload) values (v_id, 'salary_pending', jsonb_build_object('contract_type', coalesce(nullif(p ->> 'contract_type', ''), 'monthly')));
  return v_id;
end$$;
grant execute on function public.hr_employee_create(jsonb) to authenticated;

create or replace function public.hr_employee_update(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, app as $$
declare k text; v_title uuid; allowed text[] := array['full_name','email','phone','phone2','department_id','branch_id','manager_id','job_title_id','hire_date','mother_name','gender',
  'birth_date','birth_place','marital_status','education','national_id_number','residence_card_number','governorate','address','emergency_contact_name',
  'emergency_contact_phone','blood_type','biometric_pin','photo_path'];
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p ? 'job_title' then raise exception 'HR_JOB_TITLE_FREE_TEXT_FORBIDDEN'; end if;
  for k in select jsonb_object_keys(p) loop
    if not (k = any (allowed)) then raise exception 'HR_FIELD_NOT_ALLOWED: %', k; end if;
  end loop;
  if (p ->> 'biometric_pin') is not null and exists (select 1 from public.employees where biometric_pin = trim(p ->> 'biometric_pin') and id <> p_id) then raise exception 'BIO_PIN_TAKEN'; end if;
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
    updated_at = now()
  where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
end$$;
grant execute on function public.hr_employee_update(uuid, jsonb) to authenticated;

-- ─── الاستيراد: عمود المسمى يُطابَق بالاسم مع مسميات الهيكل؛ غير المطابق يُستورد بلا مسمى مع تحذير ───
create or replace function public.hr_employees_import(p_rows jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  r jsonb; i int := 0; results jsonb := '[]'::jsonb; errs text[]; warns text[]; v_dept uuid; v_branch uuid; v_shift uuid; v_title uuid; v_id uuid; p jsonb; t text;
  seen_numbers text[] := '{}'; seen_pins text[] := '{}'; seen_ids text[] := '{}';
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'HR_IMPORT_EMPTY'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'HR_IMPORT_TOO_LARGE'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; errs := '{}'; warns := '{}'; v_dept := null; v_branch := null; v_shift := null; v_title := null; v_id := null;
    p := r - 'department' - 'branch' - 'shift' - 'job_title';

    if coalesce(trim(r ->> 'employee_number'), '') = '' then errs := array_append(errs, 'HR_NUMBER_REQUIRED');
    elsif trim(r ->> 'employee_number') = any (seen_numbers) then errs := array_append(errs, 'HR_IMPORT_DUP_IN_FILE');
    elsif exists (select 1 from public.employees where employee_number = trim(r ->> 'employee_number')) then errs := array_append(errs, 'HR_NUMBER_TAKEN'); end if;
    seen_numbers := array_append(seen_numbers, coalesce(trim(r ->> 'employee_number'), ''));
    if coalesce(trim(r ->> 'full_name'), '') = '' then errs := array_append(errs, 'HR_NAME_REQUIRED'); end if;

    t := nullif(trim(coalesce(r ->> 'biometric_pin', '')), '');
    if t is not null then
      if t = any (seen_pins) then errs := array_append(errs, 'HR_IMPORT_DUP_PIN_IN_FILE');
      elsif exists (select 1 from public.employees where biometric_pin = t) then errs := array_append(errs, 'BIO_PIN_TAKEN'); end if;
      seen_pins := array_append(seen_pins, t);
    end if;
    t := nullif(trim(coalesce(r ->> 'national_id_number', '')), '');
    if t is not null then
      if t = any (seen_ids) then errs := array_append(errs, 'HR_IMPORT_DUP_ID_IN_FILE');
      elsif exists (select 1 from public.employees where national_id_number = t) then errs := array_append(errs, 'employees_national_id_uq'); end if;
      seen_ids := array_append(seen_ids, t);
    end if;

    if (r ->> 'contract_type') is not null and (r ->> 'contract_type') not in ('monthly', 'daily') then errs := array_append(errs, 'HR_CONTRACT_INVALID'); end if;
    if (r ->> 'gender') is not null and (r ->> 'gender') not in ('male', 'female') then errs := array_append(errs, 'HR_GENDER_INVALID'); end if;
    if (r ->> 'marital_status') is not null and (r ->> 'marital_status') not in ('single', 'married', 'divorced', 'widowed') then errs := array_append(errs, 'HR_MARITAL_INVALID'); end if;
    begin perform (r ->> 'hire_date')::date; perform (r ->> 'birth_date')::date; exception when others then errs := array_append(errs, 'HR_DATE_INVALID'); end;

    t := nullif(trim(coalesce(r ->> 'department', '')), '');
    if t is not null then
      select id into v_dept from public.departments where archived_at is null and is_active and not is_job_title and (name = t or upper(code) = upper(t)) limit 1;
      if v_dept is null then errs := array_append(errs, 'HR_IMPORT_DEPT_UNKNOWN'); end if;
    end if;
    -- المسمى: مطابقة بالاسم (داخل القسم المحدد إن وُجد، وإلا أي قسم) أو بالرمز
    t := nullif(trim(coalesce(r ->> 'job_title', '')), '');
    if t is not null then
      select d.id into v_title from public.departments d
       where d.archived_at is null and d.is_active and d.is_job_title
         and (lower(d.name) = lower(t) or upper(d.code) = upper(t))
         and (v_dept is null or d.parent_id = v_dept)
       order by (d.parent_id = v_dept) desc nulls last limit 1;
      if v_title is null then warns := array_append(warns, 'HR_IMPORT_JOB_TITLE_UNKNOWN'); end if;
    end if;
    t := nullif(trim(coalesce(r ->> 'branch', '')), '');
    if t is not null then
      select id into v_branch from public.branches where archived_at is null and (name = t or upper(code) = upper(t)) limit 1;
      if v_branch is null then errs := array_append(errs, 'HR_IMPORT_BRANCH_UNKNOWN'); end if;
    end if;
    t := nullif(trim(coalesce(r ->> 'shift', '')), '');
    if t is not null then
      select id into v_shift from public.hr_shifts where is_active and name = t limit 1;
      if v_shift is null then errs := array_append(errs, 'HR_IMPORT_SHIFT_UNKNOWN'); end if;
    end if;

    if cardinality(errs) = 0 and not p_dry_run then
      p := p || jsonb_strip_nulls(jsonb_build_object('department_id', v_dept, 'branch_id', v_branch, 'shift_id', v_shift, 'job_title_id', v_title));
      begin
        v_id := public.hr_employee_create(p);
      exception when others then
        errs := array_append(errs, sqlerrm);
      end;
    end if;

    results := results || jsonb_build_object('row', i, 'employee_number', r ->> 'employee_number', 'full_name', r ->> 'full_name',
      'ok', cardinality(errs) = 0, 'id', v_id, 'errors', to_jsonb(errs), 'warnings', to_jsonb(warns),
      'department_id', v_dept, 'branch_id', v_branch, 'shift_id', v_shift, 'job_title_id', v_title);
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'total', i,
    'ok', (select count(*) from jsonb_array_elements(results) x where (x ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not (x ->> 'ok')::boolean),
    'warned', (select count(*) from jsonb_array_elements(results) x where jsonb_array_length(x -> 'warnings') > 0),
    'rows', results);
end$$;
grant execute on function public.hr_employees_import(jsonb, boolean) to authenticated;

-- ─── قائمة الموظفين: المسمى بالمعرّف + علم «بلا مسمى» ───
drop function if exists public.hr_employees_list(text, uuid, uuid, text, uuid, int);
create function public.hr_employees_list(
  p_search text default null, p_department uuid default null, p_branch uuid default null, p_status text default null, p_shift uuid default null, p_limit int default 1000)
returns table(id uuid, employee_number text, full_name text, job_title text, phone text, department_id uuid, department_name text, branch_id uuid, branch_name text,
  employment_status text, contract_type text, hire_date date, terminated_at date, biometric_pin text, photo_path text,
  shift_id uuid, shift_name text, salary_status text, job_title_id uuid, is_driver boolean)
language sql stable security definer set search_path = public, app as $$
  select e.id, e.employee_number, e.full_name, e.job_title, e.phone, e.department_id, d.name, e.branch_id, b.name,
         e.employment_status, e.contract_type, e.hire_date, e.terminated_at, e.biometric_pin, e.photo_path,
         sh.shift_id, sh.shift_name, coalesce(sp.status, 'pending'), e.job_title_id, e.is_driver
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join lateral app.hr_effective_shift(e.id, current_date) sh on true
  left join public.employee_salary_profiles sp on sp.employee_id = e.id
  where app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
    and e.archived_at is null
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%' or e.phone ilike '%' || p_search || '%')
    and (p_department is null or e.department_id in (select app.hr_department_tree(p_department)) or e.job_title_id = p_department)
    and (p_branch is null or e.branch_id = p_branch)
    and (p_status is null or e.employment_status = p_status)
    and (p_shift is null or sh.shift_id = p_shift)
  order by e.employment_status = 'terminated', d.name nulls last, e.full_name
  limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
$$;
grant execute on function public.hr_employees_list(text, uuid, uuid, text, uuid, int) to authenticated;

-- ─── الآليات: السائق = موظف على مسمى «يقود آليات» فقط ───
create or replace function app.require_fleet_driver(p_employee_id uuid) returns public.employees
language plpgsql stable security definer set search_path=public,app as $$
declare e public.employees;
begin
  if p_employee_id is null then raise exception 'FLEET_DRIVER_REQUIRED'; end if;
  select * into e from public.employees where id = p_employee_id;
  if not found then raise exception 'FLEET_DRIVER_NOT_FOUND'; end if;
  if e.employment_status = 'terminated' then raise exception 'FLEET_DRIVER_TERMINATED'; end if;
  if not e.is_driver then raise exception 'FLEET_DRIVER_NOT_DRIVER_TITLE'; end if;
  return e;
end$$;

create or replace function public.fleet_driver_options(p_search text default null, p_all boolean default false)
returns table(employee_id uuid, full_name text, employee_number text, job_title text, department_name text, has_biometric boolean, employment_status text, assigned_vehicles text[])
language plpgsql stable security definer set search_path=public,app as $$
declare q text := trim(coalesce(p_search, ''));
begin
  perform app.require_fleet_master_actor();
  -- p_all مهمل (00153): القائمة حصراً لمن مسماه الوظيفي يقود آليات الشركة
  return query
  select e.id, e.full_name, e.employee_number, e.job_title, d.name, e.biometric_pin is not null, e.employment_status,
         coalesce((select array_agg(distinct v.db_number order by v.db_number) from public.garage_vehicle_shift_assignments a join public.garage_vehicles v on v.id = a.vehicle_id where a.driver_employee_id = e.id and a.ends_at is null and v.archived_at is null), '{}')
  from public.employees e left join public.departments d on d.id = e.department_id
  where e.employment_status <> 'terminated' and e.archived_at is null and e.is_driver
    and (q = '' or e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%' or coalesce(e.job_title, '') ilike '%' || q || '%')
  order by e.full_name limit 200;
end$$;
revoke all on function public.fleet_driver_options(text, boolean) from public, anon;
grant execute on function public.fleet_driver_options(text, boolean) to authenticated;
revoke all on function app.derive_employee_job_title(), app.propagate_job_title_change() from public, anon, authenticated;
