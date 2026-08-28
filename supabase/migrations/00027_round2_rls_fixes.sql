-- ═══════════════════════════════════════════════════════════════
-- 00027 · ترقيات RLS للجولة 2
-- ═══════════════════════════════════════════════════════════════

-- دور ديناميكي portal:{slug}: HR يمنحه عبر set_user_role → نسمح بالبادئة
-- (فحص role في set_user_role يمسك قائمة ثابتة — نمدّدها)
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

  -- الأدوار الثابتة فقط من القائمة؛ الديناميكية بصيغة portal:{slug} موجودة فعلاً
  if not v_is_dynamic and p_role not in ('employee', 'hr_officer', 'department_manager',
                                         'finance_officer', 'it_admin', 'super_admin') then
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

-- بذرة: صفحات المكتبة الموثقة (مرجع المصفوفة) — إعدادات لا كود
insert into public.system_settings (key, value) values
  ('page_registry', $json${
    "it": ["it.dashboard", "it.users.list", "it.users.create", "it.users.detail",
           "it.users.departments", "it.users.hub", "it.db.hub", "it.db.tables",
           "it.db.table.detail", "it.db.errors",
           "it.branches", "it.permissions", "it.portals", "it.integrations",
           "it.integrations.biometric", "it.integrations.gps", "it.updates", "it.audit"],
    "employee": ["employee.dashboard", "employee.profile", "employee.requests",
                 "employee.payslips", "employee.documents", "employee.assets"],
    "hr": ["hr.dashboard", "hr.employees", "hr.requests", "hr.attendance",
           "hr.payroll", "hr.reports"],
    "manager": ["manager.dashboard", "manager.team", "manager.approvals",
                "manager.attendance", "manager.reports"],
    "finance": ["finance.dashboard", "finance.budget", "finance.payroll",
                "finance.reports", "finance.audit"],
    "admin": ["admin.dashboard", "admin.portals", "admin.roles",
              "admin.settings", "admin.audit", "admin.backup"]
  }$json$::jsonb)
on conflict (key) do nothing;
