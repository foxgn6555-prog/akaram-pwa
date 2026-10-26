-- اختبار 00294 (00350-A): نظام الصلاحيات الموحّد — الكتالوج، الحسم بطبقاته، القوالب، الاستثناءات، الحمايات، التدقيق. بادئة pc.
set client_min_messages = notice;

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare msg text;
begin
  begin execute p_sql; exception when others then msg := sqlerrm; end;
  if msg is null then raise exception 'EXPECTED_ERROR % for: %', p_code, p_sql; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

insert into auth.users (id, email) values
  ('9c000000-0000-0000-0000-000000000001', 'pc-hr@t.iq'), ('9c000000-0000-0000-0000-000000000002', 'pc-it@t.iq'),
  ('9c000000-0000-0000-0000-000000000003', 'pc-sa@t.iq'), ('9c000000-0000-0000-0000-000000000004', 'pc-fin@t.iq'),
  ('9c000000-0000-0000-0000-000000000005', 'pc-norole@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('9c000000-0000-0000-0000-000000000001', 'hr_officer'), ('9c000000-0000-0000-0000-000000000002', 'it_admin'),
  ('9c000000-0000-0000-0000-000000000003', 'super_admin'), ('9c000000-0000-0000-0000-000000000004', 'finance_officer') on conflict do nothing;

-- ═══ P1 الكتالوج ═══
do $$ declare n int; begin
  select count(*) into n from public.permission_units; assert n >= 150, 'units ' || n;
  assert not exists (select 1 from public.permission_units where not ('view' = any(actions))), 'every unit has view';
  select count(*) into n from public.permission_portal_roles; assert n = 17, 'portal roles ' || n;
  -- لكل بوابة وحدة رئيسية مسارها = /portal
  assert not exists (select 1 from public.permission_portal_roles pr where not exists (select 1 from public.permission_units u where u.portal = pr.portal and u.path = '/' || pr.portal)), 'every portal has a home unit';
  assert (select actions from public.permission_units where key = 'hr.employees') @> '{view,edit,export}', 'hr.employees actions';
  assert (select parent_key from public.permission_units where key = 'it.user-management.list') = 'it.user-management', 'nested parent';
  raise notice 'PC1 ✅ الكتالوج';
end $$;

-- ═══ P2 الافتراضي (الدور الثابت) ═══
do $$ declare hr uuid := '9c000000-0000-0000-0000-000000000001'; sa uuid := '9c000000-0000-0000-0000-000000000003'; nr uuid := '9c000000-0000-0000-0000-000000000005'; begin
  assert app.can(hr, 'hr.employees', 'view') and app.can(hr, 'hr.employees', 'edit') and app.can(hr, 'hr', 'view'), 'hr officer sees HR';
  assert not app.can(hr, 'finance.payroll', 'view'), 'hr officer cannot see finance';
  assert not app.can(hr, 'hr.employees', 'delete'), 'action not applicable ⇒ false';
  assert not app.can(hr, 'no.such.unit', 'view'), 'unknown unit ⇒ false';
  assert app.can(sa, 'finance.payroll', 'decide') and app.can(sa, 'it.permissions', 'edit'), 'super_admin everything';
  assert not app.can(nr, 'hr', 'view'), 'no role ⇒ nothing';
  assert not app.can(null, 'hr', 'view'), 'null user ⇒ false';
  assert app.effective_permissions(hr) ? 'hr.employees' and not (app.effective_permissions(hr) ? 'finance.payroll'), 'effective map';
  assert (app.effective_permissions(hr) -> 'hr.employees') @> '["view","edit"]'::jsonb, 'effective actions';
  raise notice 'PC2 ✅ الافتراضي';
end $$;

-- ═══ P3 القوالب (تحجب وتضيف فوق الدور) ═══
do $$ declare it uuid := '9c000000-0000-0000-0000-000000000002'; hr uuid := '9c000000-0000-0000-0000-000000000001'; tpl uuid; n int; begin
  perform auth.set_test_user(it);
  tpl := public.it_permission_template_save(jsonb_build_object('name', 'موارد بشرية — قراءة فقط', 'description', 'بلا تعديل موظفين + يرى تقارير المالية'));
  n := public.it_permission_template_rules_set(tpl, '[{"unit_key":"hr.employees","action":"edit","effect":"deny"},{"unit_key":"finance.reports","action":"view","effect":"allow"},{"unit_key":"finance","action":"view","effect":"allow"}]'::jsonb);
  assert n = 3, 'rules set ' || n;
  perform public.it_user_permission_template_set(hr, tpl);
  assert not app.can(hr, 'hr.employees', 'edit'), 'template denies edit';
  assert app.can(hr, 'hr.employees', 'view'), 'view untouched';
  assert app.can(hr, 'finance.reports', 'view') and app.can(hr, 'finance', 'view'), 'template grants finance reports';
  assert not app.can(hr, 'finance.payroll', 'view'), 'not granted stays denied';
  -- قالب معطّل = لا أثر
  perform public.it_permission_template_save(jsonb_build_object('id', tpl, 'name', 'موارد بشرية — قراءة فقط', 'is_active', false));
  assert app.can(hr, 'hr.employees', 'edit') and not app.can(hr, 'finance.reports', 'view'), 'inactive template ignored';
  perform public.it_permission_template_save(jsonb_build_object('id', tpl, 'name', 'موارد بشرية — قراءة فقط', 'is_active', true));
  -- قواعد غير صالحة تُرفض كاملة
  perform pg_temp.expect_error(format($q$select public.it_permission_template_rules_set('%s', '[{"unit_key":"hr.employees","action":"delete","effect":"deny"}]')$q$, tpl), 'PERMISSION_RULES_INVALID');
  perform pg_temp.expect_error(format($q$select public.it_permission_template_rules_set('%s', '[{"unit_key":"nope","action":"view","effect":"deny"}]')$q$, tpl), 'PERMISSION_RULES_INVALID');
  perform pg_temp.expect_error(format($q$select public.it_permission_template_delete('%s')$q$, tpl), 'PERMISSION_TEMPLATE_IN_USE');
  perform pg_temp.expect_error($q$select public.it_permission_template_save('{"name":"x"}')$q$, 'PERMISSION_TEMPLATE_NAME_INVALID');
  raise notice 'PC3 ✅ القوالب';
end $$;

-- ═══ P4 الاستثناء الفردي يغلب القالب — والرئيسية لا تُحجب ═══
do $$ declare it uuid := '9c000000-0000-0000-0000-000000000002'; hr uuid := '9c000000-0000-0000-0000-000000000001'; r record; n int; begin
  perform auth.set_test_user(it);
  perform public.it_user_permission_override_set(hr, 'hr.employees', 'edit', 'allow', 'استثناء مؤقت لإدخال بيانات');
  assert app.can(hr, 'hr.employees', 'edit'), 'override allow beats template deny';
  perform public.it_user_permission_override_set(hr, 'hr.leaves', 'view', 'deny', 'لا يتعامل مع الإجازات');
  assert not app.can(hr, 'hr.leaves', 'view') and not ((app.effective_permissions(hr) -> 'hr.leaves') ? 'view') and ((app.effective_permissions(hr) -> 'hr.leaves') ? 'create'), 'override deny view only';
  perform public.it_user_permission_override_set(hr, 'hr', 'view', 'deny', null);
  assert app.can(hr, 'hr', 'view'), 'portal home view cannot be denied for its role';
  -- إزالة الاستثناء ⇒ يعود حكم القالب
  perform public.it_user_permission_override_set(hr, 'hr.employees', 'edit', null);
  assert not app.can(hr, 'hr.employees', 'edit'), 'override cleared ⇒ template deny again';
  -- المعاينة تُظهر المصدر
  select * into r from public.it_user_permissions_effective(hr) e where e.unit_key = 'hr.employees' and e.action = 'edit';
  assert r.allowed = false and r.source = 'template', 'source template: ' || r.source;
  select * into r from public.it_user_permissions_effective(hr) e where e.unit_key = 'hr.leaves' and e.action = 'view';
  assert r.allowed = false and r.source = 'override' and r.reason = 'لا يتعامل مع الإجازات', 'source override';
  select * into r from public.it_user_permissions_effective(hr) e where e.unit_key = 'hr.attendance' and e.action = 'view';
  assert r.allowed and r.source = 'role', 'source role';
  select * into r from public.it_user_permissions_effective(hr) e where e.unit_key = 'finance.payroll' and e.action = 'view';
  assert not r.allowed and r.source = 'none', 'source none';
  -- واجهة المستخدم نفسه
  perform auth.set_test_user(hr);
  assert public.can_i('hr.employees', 'view') and not public.can_i('hr.leaves') and (public.my_permissions() ? 'finance.reports'), 'can_i / my_permissions';
  perform pg_temp.expect_error($q$select app.require_can('hr.leaves', 'view')$q$, 'PERMISSION_DENIED');
  perform app.require_can('hr.employees', 'view');
  raise notice 'PC4 ✅ الاستثناءات والمعاينة';
end $$;

-- ═══ P5 الحمايات والتدقيق ═══
do $$ declare it uuid := '9c000000-0000-0000-0000-000000000002'; hr uuid := '9c000000-0000-0000-0000-000000000001'; sa uuid := '9c000000-0000-0000-0000-000000000003'; fin uuid := '9c000000-0000-0000-0000-000000000004'; tpl uuid; n int; begin
  select id into tpl from public.permission_templates where name = 'موارد بشرية — قراءة فقط';
  perform auth.set_test_user(hr);
  perform pg_temp.expect_error(format($q$select public.it_user_permission_override_set('%s', 'hr.leaves', 'view', 'allow')$q$, fin), 'IT_FORBIDDEN');
  perform pg_temp.expect_error($q$select public.it_permission_template_save('{"name":"قالب غير مصرح"}')$q$, 'IT_FORBIDDEN');
  perform pg_temp.expect_error(format($q$select * from public.it_user_permissions_effective('%s')$q$, fin), 'IT_FORBIDDEN');
  perform auth.set_test_user(it);
  perform pg_temp.expect_error(format($q$select public.it_user_permission_override_set('%s', 'it.permissions', 'edit', 'allow')$q$, it), 'PERMISSION_SELF_EDIT');
  perform pg_temp.expect_error(format($q$select public.it_user_permission_template_set('%s', '%s')$q$, it, tpl), 'PERMISSION_SELF_EDIT');
  perform pg_temp.expect_error(format($q$select public.it_user_permission_override_set('%s', 'finance.payroll', 'view', 'deny')$q$, sa), 'PERMISSION_TARGET_SUPER_ADMIN');
  perform pg_temp.expect_error(format($q$select public.it_user_permission_template_set('%s', '%s')$q$, '9c000000-0000-0000-0000-0000000000ff', tpl), 'IT_USER_NOT_FOUND');
  -- super_admin يستطيع استهداف super_admin آخر لكن لا أثر على الحسم (① يغلب)
  perform auth.set_test_user(sa);
  perform public.it_user_permission_override_set('9c000000-0000-0000-0000-000000000002', 'it.permissions', 'edit', 'deny', 'اختبار');
  assert not app.can('9c000000-0000-0000-0000-000000000002', 'it.permissions', 'edit'), 'deny on it_admin works';
  perform public.it_user_permission_override_set('9c000000-0000-0000-0000-000000000002', 'it.permissions', 'edit', null);
  -- الجداول لا تُكتب مباشرة من المصادقين (RPC فقط)
  set role authenticated; perform set_config('auth.user_id', '9c000000-0000-0000-0000-000000000002', false);
  perform pg_temp.expect_error($q$insert into public.permission_templates (name) values ('مباشر')$q$, 'row-level security');
  perform pg_temp.expect_error(format($q$insert into public.user_permission_overrides (user_id, unit_key, action, effect) values ('%s', 'hr.leaves', 'view', 'allow')$q$, hr), 'row-level security');
  reset role;
  -- التدقيق
  perform auth.set_test_user(it);
  select count(*) into n from public.it_permission_audit_list(hr); assert n >= 5, 'audit for user ' || n;
  select count(*) into n from public.it_permission_audit_list(null, tpl); assert n >= 4, 'audit for template ' || n;
  assert exists (select 1 from public.it_permission_audit_list(hr) a where a.kind = 'override_set' and a.detail->>'unit' = 'hr.leaves' and a.actor_name is not null), 'audit detail';
  -- حذف قالب غير مستخدم
  perform public.it_user_permission_template_set(hr, null);
  perform public.it_permission_template_delete(tpl);
  assert not exists (select 1 from public.permission_templates where id = tpl), 'template deleted';
  assert app.can(hr, 'hr.employees', 'edit'), 'back to role default';
  raise notice 'PC5 ✅ الحمايات والتدقيق';
end $$;
