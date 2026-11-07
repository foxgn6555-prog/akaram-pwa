-- 00371 — IT هي أعلى صلاحية؛ super_admin بوابة إدارية عادية.
-- يحافظ على الأدوار التجارية وبوابات البيانات منفصلة، ويغيّر فقط حوكمة النظام
-- (إدارة الحسابات، الأدوار، بوابة IT ومحرك الصلاحيات العام).

-- IT وحدها تملك التجاوز العام لمحرك الصلاحيات.
create or replace function app.can(p_user uuid, p_unit text, p_action text) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare u public.permission_units; eff text; r text;
begin
  if p_user is null then return false; end if;
  select * into u from public.permission_units where key = p_unit;
  if u.key is null then return false; end if;
  if not (p_action = any(u.actions)) then return false; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'it_admin') then return true; end if;
  select role into r from public.permission_portal_roles where portal = u.portal;
  if p_action = 'view' and u.parent_key is null and u.path = '/' || u.portal
     and exists (select 1 from public.user_roles where user_id = p_user and role = r) then return true; end if;
  select effect into eff from public.user_permission_overrides where user_id = p_user and unit_key = p_unit and action = p_action;
  if eff is not null then return eff = 'allow'; end if;
  select tr.effect into eff from public.user_permission_template ut
    join public.permission_templates t on t.id = ut.template_id and t.is_active
    join public.permission_template_rules tr on tr.template_id = t.id and tr.unit_key = p_unit and tr.action = p_action
   where ut.user_id = p_user;
  if eff is not null then return eff = 'allow'; end if;
  return exists (select 1 from public.user_roles where user_id = p_user and role = r);
end$$;
revoke all on function app.can(uuid, text, text) from public, anon, authenticated;

-- واجهات وإعدادات IT حصراً لتقنية المعلومات، لا لدور بوابة المدير المفوض.
create or replace function app.require_it() returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['it_admin']) then raise exception 'IT_FORBIDDEN'; end if;
end$$;

-- إدارة الحسابات والبيانات التقنية: إزالة super_admin كصلاحية تجاوز عامة؛ HR يبقى ضمن نطاقه الوظيفي.
create or replace function app.list_platform_users(p_query text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role(array['it_admin', 'hr_officer']) then raise exception 'USERS_FORBIDDEN: لا تملك صلاحية عرض المستخدمين'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until,
      'roles', coalesce(roles_agg.roles, '[]'::jsonb), 'employee_id', e.id,
      'employee_name', e.full_name, 'employee_number', e.employee_number,
      'phone', e.phone, 'job_title', e.job_title, 'department_id', e.department_id,
      'department_name', d.name
    ) order by u.created_at desc)
    from auth.users u
    left join lateral (select jsonb_agg(ur.role order by ur.role) roles from public.user_roles ur where ur.user_id = u.id) roles_agg on true
    left join public.employees e on e.user_id = u.id
    left join public.departments d on d.id = e.department_id
    where p_query is null or u.email ilike '%' || p_query || '%' or e.full_name ilike '%' || p_query || '%'
  ), '[]'::jsonb);
end$$;

create or replace function app.set_employee_profile(
  p_user_id uuid, p_full_name text, p_phone text default null, p_job_title text default null,
  p_department_id uuid default null, p_employee_number text default null
) returns void language plpgsql security definer set search_path = public, app as $$
declare v_employee_id uuid; v_existed boolean; v_number text := nullif(trim(coalesce(p_employee_number, '')), '');
begin
  if not app.has_role(array['it_admin', 'hr_officer']) then raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل بيانات المستخدمين'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED: معرف المستخدم مطلوب'; end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null or length(trim(p_full_name)) < 3 then raise exception 'NAME_REQUIRED: الاسم الكامل مطلوب (3 أحرف فأكثر)'; end if;
  if v_number is not null and exists (select 1 from public.employees where employee_number = v_number and user_id is distinct from p_user_id) then raise exception 'EMPLOYEE_NUMBER_TAKEN: الرقم الوظيفي مستخدم لموظف آخر'; end if;
  select id into v_employee_id from public.employees where user_id = p_user_id;
  v_existed := v_employee_id is not null;
  if v_employee_id is not null then
    update public.employees set full_name = trim(p_full_name), phone = nullif(trim(coalesce(p_phone, '')), ''),
      job_title = nullif(trim(coalesce(p_job_title, '')), ''),
      department_id = nullif(p_department_id, '00000000-0000-0000-0000-000000000000'::uuid), employee_number = v_number
    where id = v_employee_id;
  else
    insert into public.employees (user_id, employee_number, full_name, phone, job_title, department_id)
    values (p_user_id, v_number, trim(p_full_name), nullif(trim(coalesce(p_phone, '')), ''),
      nullif(trim(coalesce(p_job_title, '')), ''), nullif(p_department_id, '00000000-0000-0000-0000-000000000000'::uuid))
    returning id into v_employee_id;
  end if;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('employees', coalesce(v_employee_id::text, p_user_id::text), case when v_existed then 'UPDATE' else 'INSERT' end,
    jsonb_build_object('user_id', p_user_id, 'full_name', trim(p_full_name), 'phone', p_phone,
      'job_title', p_job_title, 'department_id', p_department_id, 'employee_number', v_number), auth.uid(), app.current_role());
end$$;

create or replace function app.db_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not app.has_role(array['it_admin']) then '[]'::jsonb else (
    select coalesce(jsonb_agg(jsonb_build_object('table_name', relname, 'row_estimate', greatest(n_live_tup, 0),
      'total_bytes', pg_total_relation_size(format('%I.%I', schemaname, relname)), 'seq_scan', seq_scan, 'idx_scan', idx_scan)
      order by pg_total_relation_size(format('%I.%I', schemaname, relname)) desc), '[]'::jsonb)
    from pg_stat_user_tables where schemaname = 'public') end
$$;

create or replace function app.db_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not app.has_role(array['it_admin']) then jsonb_build_object('allowed', false) else jsonb_build_object(
    'allowed', true, 'db_size_bytes', pg_database_size(current_database()), 'version', current_setting('server_version'),
    'started_at', pg_postmaster_start_time(), 'tables_count', (select count(*) from pg_stat_user_tables where schemaname = 'public'),
    'total_rows', (select coalesce(sum(greatest(n_live_tup, 0)), 0) from pg_stat_user_tables where schemaname = 'public'),
    'open_errors', (select count(*) from public.app_errors where not resolved)) end
$$;

-- بيانات قوالب الصلاحيات لا تُقرأ إلا من IT (بيانات المستخدم نفسه تبقى ذاتية).
drop policy if exists "pt: read it" on public.permission_templates;
create policy "pt: read it" on public.permission_templates for select to authenticated using (app.has_role(array['it_admin']));
drop policy if exists "ptr: read it" on public.permission_template_rules;
create policy "ptr: read it" on public.permission_template_rules for select to authenticated using (app.has_role(array['it_admin']));
drop policy if exists "upt: read it or self" on public.user_permission_template;
create policy "upt: read it or self" on public.user_permission_template for select to authenticated using (user_id = auth.uid() or app.has_role(array['it_admin']));
drop policy if exists "upo: read it or self" on public.user_permission_overrides;
create policy "upo: read it or self" on public.user_permission_overrides for select to authenticated using (user_id = auth.uid() or app.has_role(array['it_admin']));
drop policy if exists "pa: read it" on public.permission_audit;
create policy "pa: read it" on public.permission_audit for select to authenticated using (app.has_role(array['it_admin']));

-- يعكس الدور الأساسي في JWT التسلسل نفسه، حتى لو اجتمع الدوران على الحساب.
create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare claims jsonb; user_role text;
begin
  select role into user_role from public.user_roles
   where user_id = (event ->> 'user_id')::uuid
   order by array_position(array[
     'it_admin', 'super_admin', 'executive_director', 'deputy_director', 'ops_room',
     'finance_officer', 'hr_officer', 'admin_ops', 'field_ops', 'follow_up',
     'maintenance', 'transfer_station', 'disclosures_officer', 'complaints_officer',
     'media_officer', 'central_garage_officer', 'department_manager', 'employee'
   ], role)
   limit 1;
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{role}', to_jsonb(coalesce(user_role, 'employee')));
  return jsonb_set(event, '{claims}', claims);
end;
$$;
revoke all on function app.custom_access_token_hook from public, anon, authenticated;
grant execute on function app.custom_access_token_hook to supabase_auth_admin;

-- تعيين الأدوار: IT هي المتصرف الأعلى، وHR يستطيع فقط إسناد الأدوار العادية.
create or replace function app.set_user_role(p_user_id uuid, p_role text, p_grant boolean, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_is_dynamic boolean := p_role like 'portal:%';
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_is_it boolean;
begin
  if v_actor is null then raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED: المستخدم غير محدد'; end if;
  if p_role is null or trim(p_role) = '' then raise exception 'ROLE_INVALID: دور غير معروف'; end if;
  select exists (select 1 from public.user_roles where user_id = v_actor and role = 'it_admin') into v_is_it;
  if not v_is_it and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'hr_officer') then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار';
  end if;
  if not v_is_dynamic and p_role not in (
    'employee', 'hr_officer', 'department_manager', 'finance_officer',
    'it_admin', 'super_admin', 'field_ops', 'admin_ops', 'maintenance',
    'transfer_station', 'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer', 'media_officer',
    'central_garage_officer', 'follow_up'
  ) then raise exception 'ROLE_INVALID: دور غير معروف'; end if;
  if v_is_dynamic and not exists (select 1 from public.dynamic_portals where 'portal:' || slug = p_role and is_active) then
    raise exception 'ROLE_INVALID: البوابة الديناميكية غير موجودة';
  end if;
  if p_role in ('it_admin', 'super_admin') and not v_is_it then
    raise exception 'ROLE_ESCALATION_FORBIDDEN: إسناد الأدوار الإدارية متاح لتقنية المعلومات فقط';
  end if;

  -- قفل تسلسلي لمنع عمليتي سحب متزامنتين من إزالة آخر مسؤول IT.
  if p_role = 'it_admin' and not p_grant then
    perform pg_advisory_xact_lock(hashtext('user_roles:last_it_admin')::bigint);
    if exists (select 1 from public.user_roles where user_id = p_user_id and role = 'it_admin')
       and (select count(*) from public.user_roles where role = 'it_admin') <= 1 then
      raise exception 'LAST_IT_ADMIN: لا يمكن سحب دور IT من آخر حساب مسؤول';
    end if;
  end if;

  -- تعديل أدوار الذات مسموح لـ IT فقط؛ حماية آخر IT أعلاه تبقى نافذة.
  if p_user_id = v_actor and not v_is_it then
    raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, v_actor) on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
  insert into public.audit_logs(table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('user_roles', p_user_id::text, case when p_grant then 'INSERT' else 'DELETE' end,
          jsonb_build_object('role', p_role, 'granted', p_grant), v_actor, app.current_role());
end;
$$;
revoke all on function app.set_user_role(uuid,text,boolean,uuid) from public, anon, authenticated;

create or replace function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean)
returns void language plpgsql security definer set search_path = public, app as $$
begin perform app.set_user_role(p_user_id, p_role, p_grant); end$$;
revoke all on function public.set_user_role(uuid,text,boolean) from public, anon;
grant execute on function public.set_user_role(uuid,text,boolean) to authenticated;

create or replace function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean, p_actor uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin perform app.set_user_role(p_user_id, p_role, p_grant, p_actor); end$$;
revoke all on function public.set_user_role(uuid,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid,text,boolean,uuid) to service_role;
