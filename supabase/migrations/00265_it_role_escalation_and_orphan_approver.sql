-- 00309 · تدقيق بوابة IT:
--   (1) تصعيد صلاحيات: كان بإمكان حساب الموارد البشرية أو IT منح دور super_admin (أو it_admin) لأي حساب آخر وسحبه من المدير المفوض نفسه.
--       الآن: super_admin يمنحه/يسحبه super_admin فقط؛ it_admin يمنحه it_admin أو super_admin فقط؛ ولا يُسحب آخر super_admin.
--   (2) خطوة موافقة من نوع «حساب» لمستخدم حُذف لاحقاً كانت تُنتج خطوة معلّقة بلا مُعتمِد موجود (يعلق الطلب إلا للمدير المفوض). الآن تُحلّ إلى لا أحد فتُخطّى كبقية الخطوات الفارغة.
create or replace function app.set_user_role(p_user_id uuid, p_role text, p_grant boolean, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public, app
as $$
declare
  v_is_dynamic boolean := p_role like 'portal:%';
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null or not exists (select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role = any(array['it_admin', 'super_admin', 'hr_officer'])) then
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
  if v_is_dynamic and not exists (select 1 from public.dynamic_portals where 'portal:' || slug = p_role and is_active) then
    raise exception 'ROLE_INVALID: البوابة الديناميكية غير موجودة';
  end if;
  if p_user_id = v_actor then raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك'; end if;
  -- 00309: لا تصعيد صلاحيات — دور المدير المفوض يمنحه/يسحبه المدير المفوض فقط، ودور IT يمنحه IT أو المدير المفوض فقط (لا الموارد البشرية)
  if p_role = 'super_admin' and not exists (select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role = 'super_admin') then
    raise exception 'ROLE_ESCALATION_FORBIDDEN: دور المدير المفوض يمنحه أو يسحبه المدير المفوض فقط';
  end if;
  if p_role = 'it_admin' and not exists (select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role in ('it_admin', 'super_admin')) then
    raise exception 'ROLE_ESCALATION_FORBIDDEN: دور التطوير المركزية يمنحه أو يسحبه IT أو المدير المفوض فقط';
  end if;
  if not p_grant and p_role = 'super_admin' and (select count(*) from public.user_roles ur where ur.role = 'super_admin') <= 1 then
    raise exception 'LAST_SUPER_ADMIN: لا يمكن سحب دور المدير المفوض من آخر حساب يحمله';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, v_actor) on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
  insert into public.audit_logs(table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('user_roles', p_user_id::text, case when p_grant then 'INSERT' else 'DELETE' end, jsonb_build_object('role', p_role, 'granted', p_grant), v_actor, app.current_role());
end;
$$;

create or replace function app.approval_resolve_step(p_step jsonb, p_requester uuid) returns uuid[]
language plpgsql stable security definer set search_path = public, app as $$
declare r text := p_step ->> 'role'; out uuid[] := '{}'; parents text[]; emp uuid;
begin
  if p_step ->> 'kind' = 'account' then
    select coalesce(array_agg(u.id), '{}') into out from auth.users u where u.id = (p_step ->> 'user_id')::uuid;   -- 00309: حساب محذوف لا يُنتج خطوة عالقة
  elsif r = 'department_manager' then
    select array_remove(array[cp.manager_user_id], null) into out from public.contractor_profiles cp where cp.user_id = p_requester and cp.is_active;
    if coalesce(cardinality(out), 0) = 0 then
      select e.id into emp from public.employees e where e.user_id = p_requester and e.archived_at is null limit 1;
      if emp is not null then out := array_remove(array[app.hr_manager_user(emp)], null); end if;
    end if;
  elsif r = 'admin_ops' then
    parents := app.user_parent_sectors(p_requester);
    select coalesce(array_agg(distinct smp.user_id), '{}') into out from public.sector_manager_profiles smp where smp.parent_sectors && parents;
  else
    -- field_ops / deputy_director / executive_director / super_admin / hr_officer: كل أصحاب الدور (نطاق العمليات الميدانية يُدقَّق في جولتها)
    select coalesce(array_agg(distinct ur.user_id), '{}') into out from public.user_roles ur where ur.role = r;
  end if;
  return coalesce(array_remove(out, p_requester), '{}');   -- لا يوافق أحد على طلب نفسه
end$$;
