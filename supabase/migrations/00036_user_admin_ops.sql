-- ═══════════════════════════════════════════════════════════════
-- 00036 · عمليات إدارة المستخدمين الموسعة (وحدة إدارة المستخدمين)
--  · list_platform_users   : حقول إضافية (هاتف · مسمى · قسم · حالة الحساب)
--  · set_employee_profile  : إنشاء/تحديث سجل الموظف المرتبط بمستخدم
--    (يتيح لـ it_admin تعديل البيانات دون منحها UPDATE مباشر على employees —
--     كل تعديل مُدقَّن في audit_logs ومحمي بفحص دور صارم)
-- ═══════════════════════════════════════════════════════════════

-- ── قائمة المستخدمين: حقول موسّعة ──
create or replace function app.list_platform_users(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then
    raise exception 'USERS_FORBIDDEN: إدارة المستخدمين محصورة بـ IT والموارد البشرية';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',               u.id,
      'email',            u.email,
      'created_at',       u.created_at,
      'last_sign_in_at',  u.last_sign_in_at,
      'banned_until',     u.banned_until,
      'roles',            coalesce(roles_agg.roles, '[]'::jsonb),
      'employee_id',      e.id,
      'employee_name',    e.full_name,
      'employee_number',  e.employee_number,
      'phone',            e.phone,
      'job_title',        e.job_title,
      'department_id',    e.department_id,
      'department_name',  d.name
    ) order by u.created_at desc)
    from auth.users u
    left join lateral (
      select jsonb_agg(ur.role order by ur.role) as roles
      from public.user_roles ur
      where ur.user_id = u.id
    ) roles_agg on true
    left join public.employees e on e.user_id = u.id
    left join public.departments d on d.id = e.department_id
    where p_query is null
       or u.email ilike '%' || p_query || '%'
       or e.full_name ilike '%' || p_query || '%'
  ), '[]'::jsonb);
end;
$$;

-- ── إنشاء/تحديث سجل الموظف المرتبط بمستخدم (تعديل بيانات المستخدم) ──
create or replace function app.set_employee_profile(
  p_user_id         uuid,
  p_full_name       text,
  p_phone           text default null,
  p_job_title       text default null,
  p_department_id   uuid default null,
  p_employee_number text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_employee_id uuid;
  v_existed     boolean;
  v_number      text := nullif(trim(coalesce(p_employee_number, '')), '');
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل بيانات المستخدمين';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED: معرف المستخدم مطلوب';
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) < 3 then
    raise exception 'NAME_REQUIRED: الاسم الكامل مطلوب (3 أحرف فأكثر)';
  end if;

  -- تفرّد الرقم الوظيفي (مستثنى سجل المستخدم نفسه)
  if v_number is not null and exists (
    select 1 from public.employees
    where employee_number = v_number and user_id is distinct from p_user_id
  ) then
    raise exception 'EMPLOYEE_NUMBER_TAKEN: الرقم الوظيفي مستخدم لموظف آخر';
  end if;

  -- سجل موجود؟ حدّثه — وإلا أنشئه مرتبطاً
  select id into v_employee_id from public.employees where user_id = p_user_id;
  v_existed := v_employee_id is not null;

  if v_employee_id is not null then
    update public.employees
       set full_name      = trim(p_full_name),
           phone          = nullif(trim(coalesce(p_phone, '')), ''),
           job_title      = nullif(trim(coalesce(p_job_title, '')), ''),
           department_id  = nullif(p_department_id, '00000000-0000-0000-0000-000000000000'::uuid),
           employee_number = v_number
     where id = v_employee_id;
  else
    insert into public.employees (user_id, employee_number, full_name, phone, job_title, department_id)
    values (p_user_id, v_number, trim(p_full_name),
            nullif(trim(coalesce(p_phone, '')), ''),
            nullif(trim(coalesce(p_job_title, '')), ''),
            nullif(p_department_id, '00000000-0000-0000-0000-000000000000'::uuid))
    returning id into v_employee_id;
  end if;

  -- تدقيق إلزامي
  insert into public.audit_logs
    (table_name, record_id, operation, new_row, actor_id, actor_role)
  values
    ('employees', coalesce(v_employee_id::text, p_user_id::text),
     case when v_existed then 'UPDATE' else 'INSERT' end,
     jsonb_build_object('user_id', p_user_id, 'full_name', trim(p_full_name),
                        'phone', p_phone, 'job_title', p_job_title,
                        'department_id', p_department_id, 'employee_number', v_number),
     auth.uid(), app.current_role());
end;
$$;

-- ── الغلاف العام (PostgREST يكشف public فقط) ──
create or replace function public.set_employee_profile(
  p_user_id         uuid,
  p_full_name       text,
  p_phone           text default null,
  p_job_title       text default null,
  p_department_id   uuid default null,
  p_employee_number text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.set_employee_profile(p_user_id, p_full_name, p_phone, p_job_title, p_department_id, p_employee_number);
end;
$$;

grant execute on function app.set_employee_profile(uuid, text, text, text, uuid, text)  to authenticated;
grant execute on function public.set_employee_profile(uuid, text, text, text, uuid, text) to authenticated;