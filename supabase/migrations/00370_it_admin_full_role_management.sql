-- 00370 — تقنية المعلومات تدير جميع الأدوار، بما فيها دور المدير المفوض.
-- تبقى الحمايات: منع تعديل الذات، منع سحب آخر super_admin، وعدم منح super_admin لـ HR.

create or replace function app.set_user_role(p_user_id uuid, p_role text, p_grant boolean, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public, app
as $$
declare
  v_is_dynamic boolean := p_role like 'portal:%';
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_actor and ur.role = any(array['it_admin', 'super_admin', 'hr_officer'])
  ) then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار';
  end if;
  if not v_is_dynamic and p_role not in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer', 'media_officer',
    'central_garage_officer', 'follow_up'
  ) then
    raise exception 'ROLE_INVALID: دور غير معروف';
  end if;
  if v_is_dynamic and not exists (
    select 1 from public.dynamic_portals
    where 'portal:' || slug = p_role and is_active
  ) then
    raise exception 'ROLE_INVALID: البوابة الديناميكية غير موجودة';
  end if;
  if p_user_id = v_actor then raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك'; end if;

  -- المدير المفوض وتقنية المعلومات فقط يمنحان أو يسحبان super_admin؛ HR لا يستطيع التصعيد.
  if p_role = 'super_admin' and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_actor and ur.role in ('super_admin', 'it_admin')
  ) then
    raise exception 'ROLE_ESCALATION_FORBIDDEN: دور super_admin يمنحه أو يسحبه IT أو المدير المفوض فقط';
  end if;
  if p_role = 'it_admin' and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_actor and ur.role in ('it_admin', 'super_admin')
  ) then
    raise exception 'ROLE_ESCALATION_FORBIDDEN: دور تقنية المعلومات يمنحه أو يسحبه IT أو المدير المفوض فقط';
  end if;
  if not p_grant and p_role = 'super_admin' and (
    select count(*) from public.user_roles ur where ur.role = 'super_admin'
  ) <= 1 then
    raise exception 'LAST_SUPER_ADMIN: لا يمكن سحب الدور من آخر حساب super_admin';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, v_actor)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
  insert into public.audit_logs(table_name, record_id, operation, new_row, actor_id, actor_role)
  values (
    'user_roles', p_user_id::text,
    case when p_grant then 'INSERT' else 'DELETE' end,
    jsonb_build_object('role', p_role, 'granted', p_grant),
    v_actor, app.current_role()
  );
end;
$$;

-- IT يدير إعدادات الصلاحيات لحسابات super_admin أيضاً.
-- لا يُسمح بتعديل صلاحيات حساب المتصرف نفسه.
create or replace function app.perm_require_manager(p_target uuid) returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  if p_target is not null and p_target = auth.uid() then
    raise exception 'PERMISSION_SELF_EDIT';
  end if;
  if p_target is not null and not exists (select 1 from auth.users where id = p_target) then
    raise exception 'IT_USER_NOT_FOUND';
  end if;
end$$;
revoke all on function app.perm_require_manager(uuid) from public, anon, authenticated;
