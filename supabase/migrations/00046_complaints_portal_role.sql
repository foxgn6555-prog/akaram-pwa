-- ═══════════════════════════════════════════════════════════════
-- 00046 · بوابة الشكاوى: دور complaints_officer فقط
-- لا جداول أعمال في هذه المرحلة؛ لذلك لا وصول جديد للبيانات ولا سياسات RLS متساهلة.
-- ═══════════════════════════════════════════════════════════════

-- الدور الثابت الجديد مع الحفاظ على الأدوار الديناميكية portal:{slug}.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer'
  ) or role like 'portal:%');

-- أولوية الدور في JWT؛ mirror لـ ROLE_PRIORITY في الواجهة.
create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_role text;
begin
  select role into user_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid
  order by array_position(array[
    'super_admin', 'it_admin', 'executive_director', 'deputy_director',
    'ops_room', 'finance_officer', 'hr_officer', 'admin_ops',
    'field_ops', 'maintenance', 'transfer_station', 'disclosures_officer',
    'complaints_officer', 'department_manager', 'employee'
  ], role)
  limit 1;

  claims = coalesce(event -> 'claims', '{}'::jsonb);
  claims = jsonb_set(claims, '{role}', to_jsonb(coalesce(user_role, 'employee')));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function app.custom_access_token_hook from public, anon, authenticated;
grant execute on function app.custom_access_token_hook to supabase_auth_admin;

-- تحديث RPC إدارة الأدوار حتى يمكن منح الدور عبر SDK البوابة التقنية.
create or replace function app.set_user_role(p_user_id uuid, p_role text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_is_dynamic boolean := p_role like 'portal:%';
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار';
  end if;

  if not v_is_dynamic and p_role not in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer'
  ) then
    raise exception 'ROLE_INVALID: دور غير معروف';
  end if;

  if v_is_dynamic and not exists (
    select 1 from public.dynamic_portals where 'portal:' || slug = p_role and is_active
  ) then
    raise exception 'ROLE_INVALID: البوابة الديناميكية غير موجودة';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;

  insert into public.audit_logs
    (table_name, record_id, operation, new_row, actor_id, actor_role)
  values
    ('user_roles', p_user_id::text,
     case when p_grant then 'INSERT' else 'DELETE' end,
     jsonb_build_object('role', p_role, 'granted', p_grant),
     auth.uid(), app.current_role());
end;
$$;
