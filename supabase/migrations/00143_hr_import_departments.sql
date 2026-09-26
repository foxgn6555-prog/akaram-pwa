-- ═══════════════════════════════════════════════════════════════
-- 00143 · الموارد البشرية: استيراد الموظفين من Excel (تحقق مسبق + إدخال ذري لكل صف) + إدارة الهيكل التنظيمي
--   · hr_employees_import(p_rows jsonb, p_dry_run bool): يحلّ القسم/الفرع/الشفت بالاسم أو الرمز، يتحقق من كل صف، ويُرجع نتيجة لكل صف
--     (ok/id أو رمز خطأ عربي) — الصفوف الصحيحة تُدخل حتى لو فشل غيرها (كل صف في savepoint مستقل).
--   · hr_departments_overview(): شجرة الأقسام مع عدد الموظفين النشطين والمدير.
--   · hr_department_save(...): إنشاء/تعديل قسم بمنع الدورات، رمز فريد، وتعطيل آمن (لا موظفون نشطون ولا أقسام فرعية نشطة).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.hr_departments_overview()
returns table(id uuid, name text, code text, parent_id uuid, is_active boolean, manager_id uuid, manager_name text,
              employees_active int, employees_total int, children int, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.name, d.code, d.parent_id, d.is_active, d.manager_id, m.full_name,
    (select count(*)::int from public.employees e where e.department_id = d.id and e.employment_status <> 'terminated'),
    (select count(*)::int from public.employees e where e.department_id = d.id),
    (select count(*)::int from public.departments c where c.parent_id = d.id and c.is_active),
    d.created_at
  from public.departments d
  left join public.employees m on m.id = d.manager_id
  where d.archived_at is null and app.has_role(array['hr_officer', 'super_admin', 'it_admin'])
  order by d.name;
$$;
grant execute on function public.hr_departments_overview() to authenticated;

create or replace function public.hr_department_save(p_id uuid, p_name text, p_code text, p_parent uuid, p_is_active boolean default true, p_manager uuid default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid := p_id; v_cur uuid; v_n int; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not app.has_role(array['hr_officer', 'super_admin', 'it_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'HR_DEPT_NAME_REQUIRED'; end if;
  if v_code = '' then raise exception 'HR_DEPT_CODE_REQUIRED'; end if;
  if exists (select 1 from public.departments d where d.code = v_code and (p_id is null or d.id <> p_id)) then raise exception 'HR_DEPT_CODE_TAKEN'; end if;
  if p_parent is not null then
    if p_id is not null and p_parent = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
    if not exists (select 1 from public.departments where id = p_parent and archived_at is null) then raise exception 'HR_DEPT_PARENT_INVALID'; end if;
    -- منع الدورة: لا يجوز أن يكون الأب أحد أحفاد القسم نفسه
    if p_id is not null then
      v_cur := p_parent;
      for v_n in 1..64 loop
        exit when v_cur is null;
        if v_cur = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
        select parent_id into v_cur from public.departments where id = v_cur;
      end loop;
    end if;
  end if;
  if p_manager is not null and not exists (select 1 from public.employees where id = p_manager and employment_status <> 'terminated') then raise exception 'HR_DEPT_MANAGER_INVALID'; end if;

  if p_id is null then
    insert into public.departments (name, code, parent_id, is_active, manager_id) values (trim(p_name), v_code, p_parent, coalesce(p_is_active, true), p_manager) returning id into v_id;
  else
    if not exists (select 1 from public.departments where id = p_id) then raise exception 'HR_NOT_FOUND'; end if;
    if p_is_active is false then
      if exists (select 1 from public.employees where department_id = p_id and employment_status <> 'terminated') then raise exception 'HR_DEPT_HAS_EMPLOYEES'; end if;
      if exists (select 1 from public.departments where parent_id = p_id and is_active) then raise exception 'HR_DEPT_HAS_CHILDREN'; end if;
    end if;
    update public.departments set name = trim(p_name), code = v_code, parent_id = p_parent, is_active = coalesce(p_is_active, true), manager_id = p_manager where id = p_id;
  end if;
  return v_id;
end$$;
grant execute on function public.hr_department_save(uuid, text, text, uuid, boolean, uuid) to authenticated;

-- ─── استيراد الموظفين ───
create or replace function public.hr_employees_import(p_rows jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  r jsonb; i int := 0; results jsonb := '[]'::jsonb; errs text[]; v_dept uuid; v_branch uuid; v_shift uuid; v_id uuid; p jsonb; t text;
  seen_numbers text[] := '{}'; seen_pins text[] := '{}'; seen_ids text[] := '{}';
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'HR_IMPORT_EMPTY'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'HR_IMPORT_TOO_LARGE'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; errs := '{}'; v_dept := null; v_branch := null; v_shift := null; v_id := null;
    p := r - 'department' - 'branch' - 'shift';

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
      select id into v_dept from public.departments where archived_at is null and is_active and (name = t or upper(code) = upper(t)) limit 1;
      if v_dept is null then errs := array_append(errs, 'HR_IMPORT_DEPT_UNKNOWN'); end if;
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
      p := p || jsonb_strip_nulls(jsonb_build_object('department_id', v_dept, 'branch_id', v_branch, 'shift_id', v_shift));
      begin
        v_id := public.hr_employee_create(p);
      exception when others then
        errs := array_append(errs, sqlerrm);
      end;
    end if;

    results := results || jsonb_build_object('row', i, 'employee_number', r ->> 'employee_number', 'full_name', r ->> 'full_name',
      'ok', cardinality(errs) = 0, 'id', v_id, 'errors', to_jsonb(errs),
      'department_id', v_dept, 'branch_id', v_branch, 'shift_id', v_shift);
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'total', i,
    'ok', (select count(*) from jsonb_array_elements(results) x where (x ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not (x ->> 'ok')::boolean),
    'rows', results);
end$$;
grant execute on function public.hr_employees_import(jsonb, boolean) to authenticated;
