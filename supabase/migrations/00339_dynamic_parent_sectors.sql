-- ═══════════════════════════════════════════════════════════════
-- 00339 · الجولة 00393 — القطاعات ديناميكية (١/٣): جدول القطاعات + المناطق قابلة للإضافة من التطوير المركزية
--   قبل: القطاعان (karrada / zaafaraniya) مثبّتان في 16 قيد فحص و≈20 دالة تحقق وتسميات ثابتة.
--   بعد: جدول public.parent_sectors (رمز/اسم/ترتيب/فعّال) هو المصدر الوحيد؛ كل القيود الثابتة تُستبدل بمفاتيح أجنبية
--        إليه؛ كل دوال التحقق تُعاد كتابتها آلياً لتقرأ من الجدول؛ التسميات من الجدول؛ المناطق (sectors) لها «فعّال»
--        ويمكن إضافتها لأي قطاع. لا حذف إطلاقاً — إيقاف فقط (تختفي من القوائم وتبقى سجلاتها).
--   أرقام المناطق الحالية 1..8 ورموزها لا تتغير. كل تغيير في الجدولين يُسجَّل في سجل التدقيق.
-- ═══════════════════════════════════════════════════════════════

-- ── ① جدول القطاعات ──
create table if not exists public.parent_sectors (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name       text not null,
  sort       smallint not null default 0,
  is_active  boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parent_sectors enable row level security;
drop policy if exists "parent_sectors: قراءة للمصادَقين" on public.parent_sectors;
create policy "parent_sectors: قراءة للمصادَقين" on public.parent_sectors for select to authenticated using (true);
drop policy if exists "parent_sectors: كتابة للتطوير" on public.parent_sectors;
create policy "parent_sectors: كتابة للتطوير" on public.parent_sectors for all to authenticated
  using (app.has_role(array['it_admin','super_admin'])) with check (app.has_role(array['it_admin','super_admin']));
insert into public.parent_sectors (code, name, sort) values ('karrada', 'الكرادة', 1), ('zaafaraniya', 'الزعفرانية', 2) on conflict (code) do nothing;
drop trigger if exists trg_parent_sectors_touch on public.parent_sectors;
create trigger trg_parent_sectors_touch before update on public.parent_sectors for each row execute function app.set_updated_at();
drop trigger if exists trg_audit_parent_sectors on public.parent_sectors;
create trigger trg_audit_parent_sectors after insert or update or delete on public.parent_sectors for each row execute function app.audit_trigger();

-- ── ② المناطق: فعّال + مفتاح أجنبي للقطاع ──
alter table public.sectors add column if not exists is_active boolean not null default true;
alter table public.sectors add column if not exists updated_at timestamptz not null default now();
alter table public.sectors drop constraint if exists sectors_parent_sector_check;
alter table public.sectors drop constraint if exists sectors_parent_sector_fkey;
alter table public.sectors add constraint sectors_parent_sector_fkey foreign key (parent_sector) references public.parent_sectors(code);
drop trigger if exists trg_audit_sectors on public.sectors;
create trigger trg_audit_sectors after insert or update or delete on public.sectors for each row execute function app.audit_trigger();

-- ── ③ الاسم من الجدول (كانت ثابتة) ──
create or replace function app.parent_sector_name(p text) returns text language sql stable set search_path = public, app as
$$ select coalesce((select ps.name from public.parent_sectors ps where ps.code = p), p, '—') $$;

create or replace function app.parent_sector_active(p text) returns boolean language sql stable set search_path = public, app as
$$ select exists (select 1 from public.parent_sectors ps where ps.code = p and ps.is_active) $$;

-- مصفوفات القطاعات (مسؤول القاطع / المتابعة): تحقق بمشغّل بدل قيد ثابت
create or replace function app.validate_parent_sectors_array() returns trigger language plpgsql set search_path = public, app as $$
begin
  if new.parent_sectors is not null and exists (select 1 from unnest(new.parent_sectors) x where not exists (select 1 from public.parent_sectors ps where ps.code = x)) then
    raise exception 'PARENT_SECTOR_INVALID';
  end if;
  return new;
end $$;

-- ── ④ إزالة كل قيود الفحص الثابتة واستبدالها بمفاتيح أجنبية (آلياً حسب الموجود فعلاً) ──
do $$
declare c record; v_col text; v_coltype text;
begin
  for c in
    select con.oid, con.conname, con.conrelid::regclass as rel, con.conkey, pg_get_constraintdef(con.oid) as def, n.nspname
    from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and pg_get_constraintdef(con.oid) like '%zaafaraniya%'
  loop
    execute format('alter table %s drop constraint %I', c.rel, c.conname);
    if cardinality(c.conkey) = 1 then
      select a.attname, format_type(a.atttypid, a.atttypmod) into v_col, v_coltype from pg_attribute a where a.attrelid = c.rel and a.attnum = c.conkey[1];
      if v_coltype = 'text' then
        execute format('alter table %s add constraint %I foreign key (%I) references public.parent_sectors(code)', c.rel, v_col || '_parent_sector_fkey', v_col);
      elsif v_coltype = 'text[]' then
        execute format('drop trigger if exists trg_validate_parent_sectors on %s', c.rel);
        execute format('create trigger trg_validate_parent_sectors before insert or update on %s for each row execute function app.validate_parent_sectors_array()', c.rel);
        -- يبقى شرط «قطاع واحد على الأقل» لمسؤول القاطع
        if c.rel::text = 'sector_manager_profiles' then
          execute 'alter table public.sector_manager_profiles add constraint sector_manager_profiles_parent_sectors_nonempty check (cardinality(parent_sectors) >= 1)';
        end if;
      end if;
    end if;
    raise warning '00339: استُبدل القيد % على % (%)', c.conname, c.rel, c.def;
  end loop;
end $$;

-- ── ⑤ إعادة كتابة دوال التحقق والتسميات آلياً (أياً كانت نسختها الأخيرة) ──
do $$
declare f record; src text; new_src text; n int := 0;
begin
  for f in
    select p.oid, n.nspname, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and p.prosrc like '%zaafaraniya%'
  loop
    src := pg_get_functiondef(f.oid);
    new_src := src;
    -- تحقق الإدخال: قطاع فعّال من الجدول
    new_src := regexp_replace(new_src, 'not in\s*\(\s*''karrada''\s*,\s*''zaafaraniya''\s*\)', 'not in (select ps.code from public.parent_sectors ps where ps.is_active)', 'g');
    -- التسميات الثابتة
    new_src := regexp_replace(new_src, 'case\s+([A-Za-z_][A-Za-z0-9_\.]*)\s+when\s+''karrada''\s+then\s+''الكرادة''\s+else\s+''الزعفرانية''\s+end', 'app.parent_sector_name(\1)', 'g');
    -- قائمة القطاعات للخيارات
    new_src := replace(new_src, '(values (''karrada''), (''zaafaraniya'')) ps(code)', '(select ps0.code from public.parent_sectors ps0 where ps0.is_active order by ps0.sort, ps0.code) ps(code)');
    new_src := replace(new_src, '''[{"key":"karrada","label":"الكرادة"},{"key":"zaafaraniya","label":"الزعفرانية"}]''::jsonb',
      '(select coalesce(jsonb_agg(jsonb_build_object(''key'', ps0.code, ''label'', ps0.name) order by ps0.sort, ps0.code), ''[]''::jsonb) from public.parent_sectors ps0 where ps0.is_active)');
    if new_src <> src then
      execute new_src;
      n := n + 1;
    end if;
  end loop;
  raise warning '00339: أُعيدت كتابة % دالة لتقرأ القطاعات من الجدول', n;
end $$;

-- ── ⑥ واجهة التطوير المركزية ──
-- شجرة القطاعات والمناطق (للجميع — القوائم تقرأ منها؛ p_include_inactive للتطوير فقط)
create or replace function public.sectors_tree(p_include_inactive boolean default false)
returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', ps.code, 'name', ps.name, 'sort', ps.sort, 'is_active', ps.is_active,
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'sort', s.sort, 'is_active', s.is_active) order by s.sort, s.id)
                       from public.sectors s where s.parent_sector = ps.code and (s.is_active or (p_include_inactive and app.has_role(array['it_admin','super_admin'])))), '[]'::jsonb)
  ) order by ps.sort, ps.code), '[]'::jsonb)
  from public.parent_sectors ps
  where ps.is_active or (p_include_inactive and app.has_role(array['it_admin','super_admin']))
$$;
grant execute on function public.sectors_tree(boolean) to authenticated;

-- إنشاء/تعديل قطاع (الرمز ثابت بعد الإنشاء)
create or replace function public.it_parent_sector_save(p_code text, p_name text, p_sort int default null, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_code text := lower(trim(coalesce(p_code, ''))); v_name text := trim(coalesce(p_name, ''));
begin
  perform app.require_it();
  if v_code !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'PARENT_SECTOR_CODE_INVALID'; end if;
  if length(v_name) < 2 then raise exception 'PARENT_SECTOR_NAME_REQUIRED'; end if;
  if exists (select 1 from public.parent_sectors ps where ps.name = v_name and ps.code <> v_code) then raise exception 'PARENT_SECTOR_NAME_DUPLICATE'; end if;
  insert into public.parent_sectors (code, name, sort, is_active, created_by)
  values (v_code, v_name, coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.parent_sectors)), coalesce(p_is_active, true), auth.uid())
  on conflict (code) do update set name = excluded.name, sort = coalesce(p_sort, public.parent_sectors.sort), is_active = coalesce(p_is_active, public.parent_sectors.is_active);
  return public.sectors_tree(true);
end $$;
grant execute on function public.it_parent_sector_save(text, text, int, boolean) to authenticated;

-- إنشاء/تعديل منطقة (p_id فارغ ⇒ جديدة برقم تالٍ ورمز S{رقم})
create or replace function public.it_area_save(p_id int, p_parent_sector text, p_name text, p_sort int default null, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_name text := trim(coalesce(p_name, '')); v_id smallint;
begin
  perform app.require_it();
  if length(v_name) < 2 then raise exception 'AREA_NAME_REQUIRED'; end if;
  if not exists (select 1 from public.parent_sectors ps where ps.code = p_parent_sector) then raise exception 'PARENT_SECTOR_INVALID'; end if;
  if exists (select 1 from public.sectors s where s.name = v_name and s.id is distinct from p_id) then raise exception 'AREA_NAME_DUPLICATE'; end if;
  if p_id is null then
    select coalesce(max(id), 0) + 1 into v_id from public.sectors;
    insert into public.sectors (id, code, name, sort, parent_sector, is_active)
    values (v_id, 'S' || v_id, v_name, coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.sectors where parent_sector = p_parent_sector)), p_parent_sector, coalesce(p_is_active, true));
  else
    update public.sectors set name = v_name, parent_sector = p_parent_sector, sort = coalesce(p_sort, sort), is_active = coalesce(p_is_active, is_active), updated_at = now() where id = p_id;
    if not found then raise exception 'AREA_NOT_FOUND'; end if;
  end if;
  return public.sectors_tree(true);
end $$;
grant execute on function public.it_area_save(int, text, text, int, boolean) to authenticated;

-- إيقاف قطاع يوقف مناطقه معه (لا حذف)
create or replace function public.it_parent_sector_set_active(p_code text, p_is_active boolean)
returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  if not p_is_active and not exists (select 1 from public.parent_sectors ps where ps.is_active and ps.code <> p_code) then raise exception 'PARENT_SECTOR_LAST_ACTIVE'; end if;
  update public.parent_sectors set is_active = p_is_active where code = p_code;
  if not found then raise exception 'PARENT_SECTOR_NOT_FOUND'; end if;
  if not p_is_active then update public.sectors set is_active = false, updated_at = now() where parent_sector = p_code and is_active; end if;
  return public.sectors_tree(true);
end $$;
grant execute on function public.it_parent_sector_set_active(text, boolean) to authenticated;

-- ── ⑦ ملخص لوحة الشكاوى: عدّاد لكل قطاع من الجدول (المفتاحان القديمان يبقيان للواجهة الحالية حتى الجولة 00394) ──
create or replace function public.complaint_dashboard_summary()
returns jsonb language sql stable security definer set search_path=public,app as $$
  select case when not app.has_role(array['complaints_officer','super_admin']) then '{}'::jsonb else
    jsonb_build_object(
      'total',count(*),'newCount',count(*) filter(where status in('new','under_review')),
      'assigned',count(*) filter(where status='assigned'),'inProgress',count(*) filter(where status='in_progress'),
      'processed',count(*) filter(where status in('processed','quality_review','ready_to_send','sent')),
      'archived',count(*) filter(where status='archived'),'karrada',count(*) filter(where sector='karrada'),
      'zaafaraniya',count(*) filter(where sector='zaafaraniya'),
      'bySector',(select coalesce(jsonb_object_agg(ps.code, jsonb_build_object('name', ps.name, 'count', (select count(*) from public.complaints c2 where c2.sector = ps.code))), '{}'::jsonb)
                  from public.parent_sectors ps where ps.is_active)) end
  from public.complaints
$$;

-- ── ⑧ كتالوج الصلاحيات: وحدة «القطاعات والمناطق» (it.sectors) ──
-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('employee', 'employee', '/employee', 'الرئيسية', null, '{view}', 0),
  ('employee.attendance', 'employee', '/employee/attendance', 'إثبات التواجد والعدد', null, '{view,create}', 1),
  ('employee.photos', 'employee', '/employee/photos', 'إرسال الصور', null, '{view,create}', 2),
  ('hr', 'hr', '/hr', 'الرئيسية', null, '{view}', 3),
  ('hr.recruitment', 'hr', '/hr/recruitment', 'التوظيف وإنهاء الخدمات', null, '{view,create,execute}', 4),
  ('hr.hire-requests', 'hr', '/hr/hire-requests', 'تعيينات بانتظار الإكمال', null, '{view,execute}', 5),
  ('hr.employees', 'hr', '/hr/employees', 'الموظفون', null, '{view,create,edit,export,execute}', 6),
  ('hr.attendance', 'hr', '/hr/attendance', 'الحضور والانصراف', null, '{view,edit,export}', 7),
  ('hr.now', 'hr', '/hr/now', 'من في الدوام الآن', null, '{view}', 8),
  ('hr.attendance-monthly', 'hr', '/hr/attendance-monthly', 'تقرير الحضور الشهري', null, '{view,export}', 9),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 10),
  ('hr.documents', 'hr', '/hr/documents', 'وثائق الموظفين', null, '{view,edit,export}', 11),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 12),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 13),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 14),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 15),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 16),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 17),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 18),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 19),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 20),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 21),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 22),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 23),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 24),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 25),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 26),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 27),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 28),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 29),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 30),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 31),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 32),
  ('finance.letters', 'finance', '/finance/letters', 'سجل الكتب الرسمية', null, '{view,export}', 33),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 34),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 35),
  ('finance.expenses', 'finance', '/finance/expenses', 'المصاريف', null, '{view,create,edit,export}', 36),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 37),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 38),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 39),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 40),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 41),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 42),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 43),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 44),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 45),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 46),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 47),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 48),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 49),
  ('it.sectors', 'it', '/it/sectors', 'القطاعات والمناطق', null, '{view,create,edit}', 50),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 51),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 52),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 53),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 54),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 55),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 56),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 57),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 58),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 59),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 60),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 61),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 62),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 63),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 64),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 65),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 66),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 67),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 68),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 69),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 70),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 71),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 72),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 73),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 74),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 75),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 76),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 77),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 78),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 79),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 80),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 81),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 82),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 83),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 84),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 85),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 86),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 87),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 88),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 89),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 90),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 91),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 92),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 93),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 94),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 95),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 96),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 97),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 98),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 99),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 100),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 101),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 102),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 103),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 104),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 105),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 106),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 107),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 108),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 109),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 110),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 111),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 112),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 113),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 114),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 115),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 116),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 117),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 118),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 119),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 120),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 121),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 122),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 123),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 124),
  ('executive.letters', 'executive', '/executive/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 125),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 126),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 127),
  ('executive.stop-hotspots', 'executive', '/executive/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 128),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 129),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 130),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 131),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 132),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 133),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 134),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 135),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 136),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 137),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 138),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 139),
  ('deputy.letters', 'deputy', '/deputy/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 140),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 141),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 142),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 143),
  ('deputy.stop-hotspots', 'deputy', '/deputy/stop-hotspots', 'خريطة النفايات (بقع التوقف)', null, '{view}', 144),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 145),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 146),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 147),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 148),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 149),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 150),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 151),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 152),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 153),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 154),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 155),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 156),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 157),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 158),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 159),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 160),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 161),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 162),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 163),
  ('ops-room.waste-map', 'ops-room', '/ops-room/waste-map', 'خريطة النفايات (بقع التوقف)', null, '{view,export}', 164),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 165),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 166),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 167),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 168),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 169),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 170),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 171),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 172),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 173),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 174),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 175),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 176),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 177),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 178),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 179),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 180),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 181),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 182),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 183),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 184),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 185),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 186),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 187),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 188),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 189),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 190),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 191),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 192),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 193),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 194),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 195),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 196),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 197),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 198),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 199),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 200)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.now', 'hr.attendance-monthly', 'hr.leaves', 'hr.documents', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.settlements', 'finance.letters', 'finance.purchases', 'finance.budget', 'finance.expenses', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.sectors', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.letters', 'executive.events', 'executive.behavior', 'executive.stop-hotspots', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.letters', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'deputy.stop-hotspots', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'ops-room.waste-map', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
insert into public.permission_portal_roles (portal, role) values
  ('employee', 'employee'),
  ('hr', 'hr_officer'),
  ('manager', 'department_manager'),
  ('finance', 'finance_officer'),
  ('it', 'it_admin'),
  ('admin', 'super_admin'),
  ('field-ops', 'field_ops'),
  ('admin-ops', 'admin_ops'),
  ('maintenance', 'maintenance'),
  ('transfer-station', 'transfer_station'),
  ('executive', 'executive_director'),
  ('deputy', 'deputy_director'),
  ('ops-room', 'ops_room'),
  ('complaints', 'complaints_officer'),
  ('media', 'media_officer'),
  ('central-garage', 'central_garage_officer'),
  ('follow-up', 'follow_up')
on conflict (portal) do update set role = excluded.role;
delete from public.permission_portal_roles where portal not in ('employee', 'hr', 'manager', 'finance', 'it', 'admin', 'field-ops', 'admin-ops', 'maintenance', 'transfer-station', 'executive', 'deputy', 'ops-room', 'complaints', 'media', 'central-garage', 'follow-up');
-- <<catalog/>>

-- <<bindings>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
delete from public.permission_write_bindings;
insert into public.permission_write_bindings (fn, unit_key, action) values
  ('hr_employee_create', 'hr.employees', 'create'),
  ('hr_employee_terminate', 'hr.recruitment', 'execute'),
  ('hire_request_complete', 'hr.hire-requests', 'execute'),
  ('supply_request_deliver', 'ops-room.store', 'execute'),
  ('advance_request_create', 'ops-room.advances', 'create'),
  ('ops_attendance_confirm', 'ops-room.attendance', 'decide'),
  ('ops_contractor_month_approve', 'ops-room.contractor-headcounts', 'decide'),
  ('advance_deliver', 'finance.advances', 'execute'),
  ('advance_settle_cash', 'finance.advances', 'execute'),
  ('finance_payroll_approve', 'finance.payroll', 'decide'),
  ('finance_payroll_adjust', 'finance.payroll', 'edit'),
  ('finance_payroll_reconcile', 'finance.payroll', 'execute'),
  ('finance_treasury_confirm', 'finance.budget', 'decide'),
  ('cold_archive_package_create', 'it.cold-archive', 'create'),
  ('cold_archive_purge_request', 'it.cold-archive', 'delete'),
  ('cold_archive_purge_approve', 'it.cold-archive', 'decide'),
  ('cold_archive_purge_confirm', 'it.cold-archive', 'delete'),
  ('it_deduction_exemption_add', 'it.integrations.auto-deductions', 'edit'),
  ('garage_decide_tank_zero', 'it.central-garage-approvals', 'decide'),
  ('complaint_approve_report', 'complaints.processing', 'decide'),
  ('complaint_create_item_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_batch_create_items_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_start_assignment_ticket', 'manager.complaints', 'execute'),
  ('complaint_complete_assignment_ticket', 'manager.complaints', 'execute'),
  ('sector_confirm_vehicle_arrival', 'manager.vehicle-trips', 'execute'),
  ('sector_confirm_vehicle_site_return', 'manager.vehicle-trips', 'execute'),
  ('sector_submit_breakdown', 'manager.breakdown', 'create'),
  ('sector_support_request_create', 'manager.support', 'create'),
  ('garage_record_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_return', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_shift_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_decide_maintenance_dispatch', 'central-garage.maintenance-coordination', 'decide'),
  ('station_confirm_vehicle_arrival', 'transfer-station.vehicle-movements', 'execute'),
  ('station_record_exit', 'transfer-station.vehicle-movements', 'execute'),
  ('maintenance_approve_readiness', 'maintenance.vehicle-cases', 'decide'),
  ('maintenance_complete_case', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_confirm_arrival', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_inventory_create', 'maintenance.inventory', 'create'),
  ('maintenance_purchase_create', 'maintenance.purchases', 'create'),
  ('media_template_create', 'media.design-templates', 'create');
-- <<bindings/>>
