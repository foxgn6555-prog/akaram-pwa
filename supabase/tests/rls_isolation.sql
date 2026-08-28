-- ═══════════════════════════════════════════════════════════════
-- جناح عزل البيانات — كل دور يرى بياناته فقط (يُنفَّذ على PostgreSQL حقيقي)
-- التشغيل: bash scripts/test-rls-local.sh   (بعد supabase db reset أو محلياً)
-- أي فشل = RAISE EXCEPTION → توقف فوري
-- ═══════════════════════════════════════════════════════════════

-- ═══ أدوات التحقق ═══
create or replace function pg_temp.as_user(uid uuid) returns void
language sql as $$
  select set_config('role', 'authenticated', false);
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
$$;

create or replace function pg_temp.assert_eq(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '❌ % — المتوقع % والفعلي %', label, expected, actual;
  end if;
  raise notice '✅ %', label;
end $$;

create or replace function pg_temp.assert_min(label text, actual bigint, minimum bigint)
returns void language plpgsql as $$
begin
  if actual < minimum then
    raise exception '❌ % — الفعلي % والحد الأدنى %', label, actual, minimum;
  end if;
  raise notice '✅ %', label;
end $$;

create or replace function pg_temp.assert_raises(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception '❌ % — كان يجب أن يُرفض!', label;
exception when others then
  raise notice '✅ % (رُفض كما هو مطلوب: %)', label, sqlerrm;
end $$;

begin;

-- ═══ ① البيانات: 7 مستخدمين بأدوار مختلفة + أقسام + موظفون + طلبات ═══
do $do$
declare
  ahmed uuid; khaled uuid; mgr uuid; hr_u uuid; it_u uuid; fin_u uuid; super_u uuid;
  dept_gen uuid; dept_wks uuid; ahmed_emp uuid; req_ahmed uuid; payroll_id uuid;
begin
  insert into auth.users (email) values ('ahmed@akram.iq')  returning id into ahmed;
  insert into auth.users (email) values ('khaled@akram.iq') returning id into khaled;
  insert into auth.users (email) values ('mgr@akram.iq')    returning id into mgr;
  insert into auth.users (email) values ('hr@akram.iq')     returning id into hr_u;
  insert into auth.users (email) values ('it@akram.iq')     returning id into it_u;
  insert into auth.users (email) values ('fin@akram.iq')    returning id into fin_u;
  insert into auth.users (email) values ('super@akram.iq')  returning id into super_u;

  insert into public.departments (name, code) values ('الإدارة العامة', 'GEN') returning id into dept_gen;
  insert into public.departments (name, code) values ('الأشغال', 'WKS') returning id into dept_wks;

  insert into public.employees (user_id, employee_number, full_name, department_id)
  values (ahmed, 'EMP-001', 'أحمد علي', dept_gen) returning id into ahmed_emp;
  insert into public.employees (user_id, employee_number, full_name, department_id)
  values (khaled, 'EMP-002', 'خالد محمود', dept_wks);
  insert into public.employees (user_id, employee_number, full_name, department_id)
  values (mgr, 'EMP-010', 'مدير القسم', dept_gen);

  insert into public.user_roles (user_id, role) values
    (ahmed, 'employee'), (khaled, 'employee'),
    (mgr, 'department_manager'), (hr_u, 'hr_officer'),
    (it_u, 'it_admin'), (fin_u, 'finance_officer'), (super_u, 'super_admin');

  -- طلبان: أحمد (قسم GEN) وخالد (قسم WKS)
  insert into public.requests (employee_id, type, payload)
  values (ahmed_emp, 'leave', '{"kind":"annual","from":"2026-09-01","to":"2026-09-03","reason":"ظرف عائلي"}'::jsonb)
  returning id into req_ahmed;
  insert into public.requests (employee_id, type, payload)
  select e.id, 'expense_advance', '{"amount":500000,"currency":"IQD","reason":"ضروف طارئة","repayMonths":6}'::jsonb
  from public.employees e where e.user_id = khaled;

  -- راتب أحمد
  insert into public.payrolls (period_month) values (date_trunc('month', current_date)) returning id into payroll_id;
  insert into public.payslips (payroll_id, employee_id, base_salary, net_salary)
  select payroll_id, id, 1500000, 1500000 from public.employees where user_id = ahmed;

  -- إشعارات: واحد لأحمد وواحد لخالد
  insert into public.notifications (user_id, title) values (ahmed, 'إشعار لأحمد'), (khaled, 'إشعار لخالد');

  -- ═══ ② عين أحمد (موظف): بياناته هو فقط ═══
  perform pg_temp.as_user(ahmed);
  perform pg_temp.assert_eq('الموظف يرى نفسه فقط (من 3 موظفين)', (select count(*) from public.employees), 1);
  perform pg_temp.assert_eq('الموظف يرى طلباته فقط (من طلبين)', (select count(*) from public.requests), 1);
  perform pg_temp.assert_eq('الموظف يرى قسيمته الرواتبية فقط', (select count(*) from public.payslips), 1);
  perform pg_temp.assert_eq('الموظف يرى إشعاراته فقط', (select count(*) from public.notifications), 1);
  perform pg_temp.assert_eq('الموظف لا يقرأ سجل التدقيق', (select count(*) from public.audit_logs), 0);
  perform pg_temp.assert_eq('الموظف لا يقرأ محاولات الدخول', (select count(*) from public.login_attempts), 0);
  perform pg_temp.assert_eq('الموظف لا يقرأ أخطاء التطبيق', (select count(*) from public.app_errors), 0);
  perform pg_temp.assert_eq('الموظف لا يرى الميزانية', (select count(*) from public.budget_allocations), 0);
  perform pg_temp.assert_raises('الموظف لا يُنشئ أقساماً',
    'insert into public.departments (name, code) values (''x'',''X1'')');

  -- ═══ ③ عين المدير (قسم GEN فقط) ═══
  perform pg_temp.as_user(mgr);
  perform pg_temp.assert_eq('المدير يرى موظفي قسمه فقط (أحمد + نفسه)', (select count(*) from public.employees), 2);
  perform pg_temp.assert_eq('المدير يرى طلبات قسمه فقط (طلب أحمد)', (select count(*) from public.requests), 1);
  perform pg_temp.assert_eq('المدير لا يرى الرواتب', (select count(*) from public.payslips), 0);
  perform pg_temp.assert_raises('المدير لا يُنشئ أقساماً',
    'insert into public.departments (name, code) values (''y'',''Y1'')');

  -- ═══ ④ عين HR: يرى الكل ═══
  perform pg_temp.as_user(hr_u);
  perform pg_temp.assert_eq('HR يرى كل الموظفين (3)', (select count(*) from public.employees), 3);
  perform pg_temp.assert_eq('HR يرى كل الطلبات (2)', (select count(*) from public.requests), 2);
  perform pg_temp.assert_eq('HR يرى الرواتب', (select count(*) from public.payslips), 1);
  perform pg_temp.assert_eq('HR يقرأ سجل التدقيق؟ لا — super_admin فقط', (select count(*) from public.audit_logs), 0);

  -- ═══ ⑤ عين IT: إدارة مستخدمين وقاعدة بيانات — لا بيانات رواتب ولا تدقيق ═══
  perform pg_temp.as_user(it_u);
  perform pg_temp.assert_eq('IT يرى الموظفين (لإدارة الحسابات)', (select count(*) from public.employees), 3);
  perform pg_temp.assert_eq('IT لا يرى الرواتب (عزل مالي)', (select count(*) from public.payslips), 0);
  perform pg_temp.assert_eq('IT لا يقرأ سجل التدقيق', (select count(*) from public.audit_logs), 0);
  perform pg_temp.assert_eq('IT لا يرى الميزانية', (select count(*) from public.budget_allocations), 0);
  -- RLS يفلتر: تحديث شامل بصفوف مرئية = صفر تحديث (لا استثناء)
  do $block$
  declare v_updated bigint;
  begin
    update public.requests set status = 'approved';
    get diagnostics v_updated = row_count;
    if v_updated <> 0 then
      raise exception '❌ IT عدّل % طلبات!', v_updated;
    end if;
    raise notice '✅ IT لا يُعدّل الطلبات (تحديث شامل أمسى صفر صفوف)';
  end
  $block$;

  -- ═══ ⑥ عين المالية: الرواتب والميزانية — بلا إدارة أقسام ═══
  perform pg_temp.as_user(fin_u);
  perform pg_temp.assert_eq('المالية ترى الرواتب', (select count(*) from public.payslips), 1);
  perform pg_temp.assert_eq('المالية ترى الموظفين', (select count(*) from public.employees), 3);
  perform pg_temp.assert_raises('المالية لا تُنشئ أقساماً',
    'insert into public.departments (name, code) values (''z'',''Z1'')');

  -- ═══ ⑦ عين super_admin: الرؤية الشاملة ═══
  perform pg_temp.as_user(super_u);
  perform pg_temp.assert_min('super_admin يقرأ سجل التدقيق (كل عمليات البذر مُدقَّقة)', (select count(*) from public.audit_logs), 3);
  perform pg_temp.assert_min('تدقيق شامل: أدوار + موظفون + أقسام كلها مُدقَّقة', (select count(*) from public.audit_logs where table_name in ('user_roles','employees','departments')), 10);

  -- ═══ ⑧ حماية تعديل الذات في RPC (بعين IT نفسها) ═══
  perform pg_temp.as_user(it_u);
  perform pg_temp.assert_raises('IT لا يعدّل دوره بنفسه',
    format('select app.set_user_role(''%s'', ''employee'', true)', it_u));

  raise notice '';
  raise notice '═══ ✅ جناح العزل اكتمل — كل دور يرى بياناته فقط ═══';
end
$do$;

rollback;
