-- 20261110120000_revoke_it_admin_operational_writes.sql
--
-- قرار المستخدم (الجولة 3): «اسحب صلاحيات الكتابة من it-admin».
--
-- المبدأ الحاكم (docs/governance-roles.md):
--   · it_admin = السلطة العليا **تقنياً** (النظام/الصلاحيات/الحسابات) — **لا بيانات تشغيلية**.
--   · super_admin = المدير المفوض = مدير الشركة — يقرأ ويكتب كل شيء.
--
-- النطاق: **البيانات التشغيلية فقط** — أي الجداول التي لا تُكتب من أي شاشة في بوابة IT
-- (تم التحقق بالكود قبل التنفيذ: لا صفحة في `src/portals/**` تستدعي دالة كتابة على هذه الجداول):
--   · garage_user_profiles    (ملفات مستخدمي الكراج)        — ALL
--   · parent_sectors          (القطاعات الأم)               — ALL
--   · sector_workers          (عمال القاطع)                 — INSERT / UPDATE / DELETE
--   · sector_supply_requests  (طلبات التجهيز)               — UPDATE
--
-- ما **لم** يُلمس (عن قصد — صلاحيات تقنية/تنظيمية لبوابة IT، ولها شاشات حيّة في `/it`):
--   branches · departments · sectors · manager_profiles · sector_vehicles (GpsPage)
--   portal_units · dynamic_portals · system_settings · role_page_permissions
--   user_page_overrides · biometric_devices · biometric_adms_endpoints · gps_providers
--   vehicles · app_errors · it_assets · it_tickets
--
-- الأمان: لا حذف لأي سياسة، ولا حذف بيانات — فقط إعادة صياغة تعبير السياسة بحذف `it_admin`
-- من مصفوفة الأدوار. الأدوار الأخرى في كل سياسة تبقى كما هي حرفياً.
-- مُختبرة داخل معاملة أُرجعت (rollback) قبل التثبيت.

do $$
declare
  r record;
  parts text[];
  sql text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and cmd <> 'SELECT'
      and tablename in ('garage_user_profiles', 'parent_sectors', 'sector_workers', 'sector_supply_requests')
      and (coalesce(qual, '') like '%it_admin%' or coalesce(with_check, '') like '%it_admin%')
  loop
    parts := array[]::text[];

    if r.qual is not null then
      parts := parts || format('using (%s)',
        regexp_replace(regexp_replace(r.qual, '''it_admin''::text, ', '', 'g'), ', ''it_admin''::text', '', 'g'));
    end if;

    if r.with_check is not null then
      parts := parts || format('with check (%s)',
        regexp_replace(regexp_replace(r.with_check, '''it_admin''::text, ', '', 'g'), ', ''it_admin''::text', '', 'g'));
    end if;

    if array_length(parts, 1) is null then
      continue;
    end if;

    sql := format('alter policy %I on public.%I %s', r.policyname, r.tablename, array_to_string(parts, ' '));
    execute sql;
    raise notice 'revoked it_admin → %', sql;
  end loop;
end $$;

-- حارس: يفشل الترحيل إن بقي أي أثر لـ it_admin في سياسات كتابة هذه الجداول
do $$
declare n int;
begin
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and cmd <> 'SELECT'
    and tablename in ('garage_user_profiles', 'parent_sectors', 'sector_workers', 'sector_supply_requests')
    and (coalesce(qual, '') like '%it_admin%' or coalesce(with_check, '') like '%it_admin%');

  if n > 0 then
    raise exception 'REVOKE_INCOMPLETE: % سياسة ما زالت تسمح لـ it_admin بالكتابة', n;
  end if;
end $$;
