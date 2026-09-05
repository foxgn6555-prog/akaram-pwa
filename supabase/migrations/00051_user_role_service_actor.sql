-- ═══════════════════════════════════════════════════════════════
-- 00051 · إصلاح تعيين الأدوار من Edge Function (service_role)
-- ─────────────────────────────────────────────────────────────────
-- السبب: app.set_user_role كان يتحقق من المتصرّف عبر app.has_role()
--        وauth.uid()، وكلاهما NULL تحت اتصال service_role (Edge Function
--        admin-users) → تعيين الدور كان يرفع USERS_FORBIDDEN دائماً →
--        الأدوار «لا تُرفع» فعلياً رغم وجودها في القيد وهوك JWT.
-- الإصلاح: معامل p_actor اختياري (Backward-compatible لنداءات العميل
--          عبر المتصفح حيث auth.uid() تملؤه تلقائياً) + التحقق من دور
--          المتصرّف من جدول user_roles مباشرة بدل الاعتماد على auth.uid().
-- ═══════════════════════════════════════════════════════════════

create or replace function app.set_user_role(
  p_user_id uuid,
  p_role text,
  p_grant boolean,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_is_dynamic boolean := p_role like 'portal:%';
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  -- المتصرّف الحقيقي لا بد منه (JWT العميل أو من يمرّره admin-users)
  if v_actor is null then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار';
  end if;

  -- المصدر الوحيد لصلاحية المتصرّف هو جدول user_roles (وليس auth.uid())
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_actor
      and ur.role = any(array['it_admin', 'super_admin', 'hr_officer'])
  ) then
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

  if p_user_id = v_actor then
    raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, v_actor)
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
     v_actor, app.current_role());
end;
$$;

-- ── غلاف public (توافق RPC من المتصفح) — 3 معاملات فقط ──
create or replace function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean)
returns void language plpgsql security definer
set search_path = public, app as $$
begin
  perform app.set_user_role(p_user_id, p_role, p_grant);
end $$;

grant execute on function public.set_user_role(uuid,text,boolean) to authenticated;

-- ── نسخة public بـ4 معاملات (تُستخدم حصراً من admin-users عبر service_role) ──
create or replace function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean, p_actor uuid)
returns void language plpgsql security definer
set search_path = public, app as $$
begin
  perform app.set_user_role(p_user_id, p_role, p_grant, p_actor);
end $$;

grant execute on function public.set_user_role(uuid,text,boolean,uuid) to service_role;