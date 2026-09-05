-- ═══════════════════════════════════════════════════════════════
-- 00052 · إصلاح ظهور الشكاوى المسندة لدى مسؤول القسم
-- ─────────────────────────────────────────────────────────────────
-- المشكلة 1 (الجذرية): سياسة «complaints: assigned manager read»
--   أُنشئت بـ (i.complaint_id = id) ففسّرتها PostgreSQL داخل subquery
--   على أنها (i.complaint_id = i.id) — شرط خاطئ دائماً.
--   أي استعلام من المدير يستخدم complaints!inner(...) (كـ itemCols في
--   واجهة المدير) يحذف كل الصفوف → الصفحة فارغة رغم صحة الإسناد.
-- المشكلة 2: app.page_access كانت تطابق `manager.%` (بنقطة) بينما مفاتيح
--   الصفحات في config قد تكون بشرطة (manager/complaints) → حجب افتراضي.
-- ═══════════════════════════════════════════════════════════════

-- ── ① تصحيح السياسة: إعادة إنشاء بنمط صحيح ──
drop policy if exists "complaints: assigned manager read" on public.complaints;
create policy "complaints: assigned manager read" on public.complaints
  for select to authenticated using (
    exists (select 1 from public.complaint_items i where i.complaint_id = complaints.id and i.assigned_to = auth.uid())
  );

-- ── ② منح صريح لصفحة شكاوى المدير (طبقة حماية إضافية فوق الافتراضي) ──
insert into public.role_page_permissions (role, page_key, effect)
values ('department_manager', 'manager/complaints', 'grant')
on conflict (role, page_key) do nothing;

-- ── ③ جعل page_access متوافقاً مع صيغتي العنوان (نقطة أو شرطة) ──
create or replace function app.page_access(p_page_key text, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_locked boolean;
  v_allowed boolean;
  v_hidden boolean;
  v_key text := replace(p_page_key, '/', '.');
begin
  -- ① القفل الفردي — الحكم الأخير
  select (effect = 'allow') into v_allowed
  from public.user_page_overrides
  where user_id = p_user_id and page_key = p_page_key;
  if v_allowed is not null then
    return v_allowed;   -- allow → صحيح، lock → خطأ (يتجاوز كل شيء)
  end if;

  -- ② إخفاء الدور
  select exists (
    select 1 from public.role_page_permissions
    where role in (select role from public.user_roles where user_id = p_user_id)
      and page_key = p_page_key
      and effect = 'hide'
  ) into v_hidden;
  if v_hidden then
    return false;
  end if;

  -- ③ منح الدور
  select exists (
    select 1 from public.role_page_permissions
    where role in (select role from public.user_roles where user_id = p_user_id)
      and page_key = p_page_key
      and effect = 'grant'
  ) into v_allowed;
  if v_allowed then
    return true;
  end if;

  -- ④ الافتراضي: أدوار البوابات الثابتة ترى صفحات بوابتها (بادئة المفتاح)
  if v_key like 'employee.%' and app.has_role(array['employee']) then
    return true;
  end if;
  if v_key like 'hr.%' and app.has_role(array['hr_officer']) then
    return true;
  end if;
  if v_key like 'manager.%' and app.has_role(array['department_manager']) then
    return true;
  end if;
  if v_key like 'finance.%' and app.has_role(array['finance_officer']) then
    return true;
  end if;
  if v_key like 'it.%' and app.has_role(array['it_admin']) then
    return true;
  end if;
  if v_key like 'admin.%' and app.has_role(array['super_admin']) then
    return true;
  end if;

  -- ⑤ البوابات الديناميكية: صاحب portal:{slug} يرى صفحاتها
  if v_key like 'p_%' then
    if exists (
      select 1
      from public.user_roles ur
      join public.dynamic_portals dp on 'portal:' || dp.slug = ur.role
      join public.portal_units pu on pu.portal_id = dp.id
      where ur.user_id = p_user_id
        and p_page_key = any (pu.page_keys)
    ) then
      return true;
    end if;
  end if;

  -- ⑥ غير ذلك: super_admin فقط
  return app.has_role(array['super_admin']);
end;
$$;

revoke all on function app.page_access(text, uuid) from public, anon, authenticated;
grant execute on function app.page_access(text, uuid) to authenticated, service_role;