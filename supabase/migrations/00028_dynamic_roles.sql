-- ═══════════════════════════════════════════════════════════════
-- 00028 · الأدوار الديناميكية: فتح قيد user_roles لصيغة portal:{slug}
-- الأمان: الفتح مقيد — set_user_role يتحقق أن portal:{slug} موجود في dynamic_portals
-- (لا يمكن اختراع دور ديناميكي في الهواء)
-- ═══════════════════════════════════════════════════════════════

alter table public.user_roles drop constraint user_roles_role_check;

alter table public.user_roles add constraint user_roles_role_check
  check (role in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin'
  ) or role like 'portal:%');
