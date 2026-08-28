-- ═══════════════════════════════════════════════════════════════
-- 00023 · مصفوفة صلاحيات الصفحات — ثلاث طبقات بأولوية صارمة:
--   1) user_page_overrides (قفل/فتح لشخص)   — الحكم الأخير دائماً
--   2) role_page_permissions (منح/إخفاء لدور) — تعلو الافتراضي
--   3) الافتراضي: الصفحة متاحة لمن يملك دور بوابتها (deny by default للباقي)
-- مفتاح الصفحة page_key: 'it.users.list' — مرجع ثابت في الكود، إدارته بيانات هنا.
-- ═══════════════════════════════════════════════════════════════

-- ── منح/إخفاء لكل دور ──
create table public.role_page_permissions (
  id         uuid primary key default gen_random_uuid(),
  role       text not null,
  page_key   text not null,
  effect     text not null check (effect in ('grant', 'hide')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (role, page_key)
);

-- ── قفل/فتح لشخص معين (يتجاوز الدور) ──
create table public.user_page_overrides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  page_key   text not null,
  effect     text not null check (effect in ('allow', 'lock')),
  reason     text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (user_id, page_key)
);

alter table public.role_page_permissions enable row level security;
alter table public.user_page_overrides   enable row level security;

-- القراءة: كل مصادق يحتاج مصفوفته ليخفي شريطه (لا أسرار في هذه الجداول)
create policy "rpp: قراءة للمصادقين" on public.role_page_permissions
  for select to authenticated using (true);

create policy "upo: قراءة للمصادقين" on public.user_page_overrides
  for select to authenticated using (true);

-- الإدارة: IT / Super Admin حصراً
create policy "rpp: إدارة بواسطة IT" on public.role_page_permissions
  for all to authenticated
  using      (app.has_role(array['it_admin', 'super_admin']))
  with check (app.has_role(array['it_admin', 'super_admin']));

create policy "upo: إدارة بواسطة IT" on public.user_page_overrides
  for all to authenticated
  using      (app.has_role(array['it_admin', 'super_admin']))
  with check (app.has_role(array['it_admin', 'super_admin']));

create index idx_rpp_role      on public.role_page_permissions (role);
create index idx_rpp_page      on public.role_page_permissions (page_key);
create index idx_upo_user      on public.user_page_overrides (user_id);
create index idx_upo_page      on public.user_page_overrides (page_key);

-- ═══ الدالة الحاسمة: هل يرى هذا المستخدم هذه الصفحة؟ ═══
-- (تُنادى عبر غلاف public في 00022-ب — الاسم: public.page_access)
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
  if p_page_key like 'employee.%' and app.has_role(array['employee']) then
    return true;
  end if;
  if p_page_key like 'hr.%' and app.has_role(array['hr_officer']) then
    return true;
  end if;
  if p_page_key like 'manager.%' and app.has_role(array['department_manager']) then
    return true;
  end if;
  if p_page_key like 'finance.%' and app.has_role(array['finance_officer']) then
    return true;
  end if;
  if p_page_key like 'it.%' and app.has_role(array['it_admin']) then
    return true;
  end if;
  if p_page_key like 'admin.%' and app.has_role(array['super_admin']) then
    return true;
  end if;

  -- ⑤ البوابات الديناميكية: صاحب portal:{slug} يرى صفحاتها
  if p_page_key like 'p_%' then
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
