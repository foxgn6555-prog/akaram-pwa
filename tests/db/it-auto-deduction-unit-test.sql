-- 00195 · وحدة الاستقطاعات التلقائية (التطوير المركزية): قواعد متعددة · نطاق (فرع/قسم/مسمى/موظف) الأخص يغلب · استثناءات · المحرّك والتصدير
-- يقرآن قاعدة الموظف · المحاكاة · السجل · توافق سياسة HR القديمة. (بادئة dr)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00201: هذا الاختبار يتحقق من النموذج القديم (الراتب كاملاً ناقص الغياب)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'dr-ops@t.iq'), ('d1000000-0000-0000-0000-000000000004', 'dr-adm@t.iq'), ('d1000000-0000-0000-0000-000000000007', 'dr-fin@t.iq'),
  ('d1000000-0000-0000-0000-000000000008', 'dr-it@t.iq'), ('d1000000-0000-0000-0000-00000000000a', 'dr-a@t.iq'), ('d1000000-0000-0000-0000-00000000000b', 'dr-b@t.iq'), ('d1000000-0000-0000-0000-00000000000c', 'dr-c@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d1000000-0000-0000-0000-000000000001', 'ops_room'), ('d1000000-0000-0000-0000-000000000004', 'super_admin'), ('d1000000-0000-0000-0000-000000000007', 'finance_officer'),
  ('d1000000-0000-0000-0000-000000000008', 'it_admin'), ('d1000000-0000-0000-0000-00000000000a', 'employee'), ('d1000000-0000-0000-0000-00000000000b', 'employee'), ('d1000000-0000-0000-0000-00000000000c', 'employee')
on conflict do nothing;
select set_config('test.dr_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
insert into public.branches (id, name, code) values ('d1000000-0000-0000-0000-0000000000b1', 'dr فرع 1', 'DR1'), ('d1000000-0000-0000-0000-0000000000b2', 'dr فرع 2', 'DR2') on conflict (id) do nothing;
insert into public.departments (id, name, code, parent_id) values
  ('d1000000-0000-0000-0000-0000000000c1', 'dr النقل', 'DRT', null), ('d1000000-0000-0000-0000-0000000000c2', 'dr الإدارة', 'DRA', null),
  ('d1000000-0000-0000-0000-0000000000c3', 'dr سائق', 'DRD', 'd1000000-0000-0000-0000-0000000000c1') on conflict (id) do nothing;
update public.departments set is_job_title = true where id = 'd1000000-0000-0000-0000-0000000000c3';
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin, branch_id, department_id, job_title_id) values
  ('d1000000-0000-0000-0000-0000000000ea', 'd1000000-0000-0000-0000-00000000000a', 'dr موظف أ (سائق/النقل/فرع1)', 'DR-A', '2024-01-01', '8401', 'd1000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000c1', 'd1000000-0000-0000-0000-0000000000c3'),
  ('d1000000-0000-0000-0000-0000000000eb', 'd1000000-0000-0000-0000-00000000000b', 'dr موظف ب (الإدارة/فرع1)', 'DR-B', '2024-01-01', '8402', 'd1000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000c2', null),
  ('d1000000-0000-0000-0000-0000000000ec', 'd1000000-0000-0000-0000-00000000000c', 'dr موظف ج (الإدارة/فرع2)', 'DR-C', '2024-01-01', '8403', 'd1000000-0000-0000-0000-0000000000b2', 'd1000000-0000-0000-0000-0000000000c2', null)
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('d1000000-0000-0000-0000-0000000000a1', 'dr شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('d1000000-0000-0000-0000-0000000000ea', 'd1000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('d1000000-0000-0000-0000-0000000000eb', 'd1000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('d1000000-0000-0000-0000-0000000000ec', 'd1000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('d1000000-0000-0000-0000-0000000000d1', 'DR-DEV-1', 'dr جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select auth.set_test_user('d1000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 600000, 0, '{}', '{}', null);
  end loop;
end $$;

-- ═══ S1 · القاعدة الافتراضية موجودة ومطابقة لسياسة HR؛ الجميع على «default» ═══
select auth.set_test_user('d1000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; r jsonb; begin
  r := public.it_deduction_rules();
  assert jsonb_array_length(r) >= 1 and (r -> 0 ->> 'is_default')::boolean, 'S1 default rule: ' || r::text;
  assert (r -> 0 -> 'settings' -> 'deduction_tiers') = (app.hr_policy() -> 'deduction_tiers'), 'S1 tiers mirror policy';
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ea', current_date);
  assert j ->> '_source' = 'default' and (j ->> 'auto_deduction_enabled')::boolean and not (j ->> '_exempt')::boolean, 'S1 source: ' || j::text;
  raise notice 'S1 ✅ القاعدة الافتراضية';
end $$;

-- ═══ S2 · قاعدة «صارمة» (بصمة ناقصة = غياب، مبالغ ثابتة 5,000/يوم و100/دقيقة، شرائح مختلفة) على قسم النقل ⇒ تصل إلى مسمى «سائق» تحته ═══
do $$ declare rid uuid; j jsonb; ok boolean; begin
  ok := false;
  begin perform public.it_deduction_rule_save(jsonb_build_object('name', 'x', 'settings', jsonb_build_object('deduction_tiers', '[{"from":5,"to":null,"minutes":10}]'::jsonb)));
  exception when others then ok := sqlerrm like '%HR_TIERS_INVALID%'; end;
  assert ok, 'S2 tiers must start at 1';
  rid := public.it_deduction_rule_save(jsonb_build_object('name', 'dr صارمة', 'description', 'للسائقين', 'settings', jsonb_build_object(
    'incomplete_punch_as_absent', true, 'auto_deduction_amount_mode', 'fixed', 'fixed_absent_day_amount', 5000, 'fixed_shortfall_minute_amount', 100, 'grace_minutes_default', 5,
    'deduction_tiers', '[{"from":1,"to":5,"minutes":0},{"from":6,"to":30,"minutes":30},{"from":31,"to":null,"day_fraction":0.5}]'::jsonb)));
  perform set_config('test.dr_rule', rid::text, false);
  perform public.it_deduction_targets_set(rid, '[{"target_type":"department","target_id":"d1000000-0000-0000-0000-0000000000c1"}]'::jsonb);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ea', current_date);
  assert j ->> '_source' = 'department' and (j ->> '_rule_id')::uuid = rid and (j ->> 'fixed_absent_day_amount')::numeric = 5000, 'S2 A via job-title child: ' || j::text;
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000eb', current_date);
  assert j ->> '_source' = 'default', 'S2 B stays default';
  assert (select count(*) from jsonb_array_elements(public.it_deduction_rules()) x where x ->> 'name' = 'dr صارمة' and (x ->> 'employees_count')::int = 1) = 1, 'S2 employees_count';
  raise notice 'S2 ✅ قاعدة على قسم تصل إلى المسمى تحته';
end $$;

-- ═══ S3 · الأخص يغلب: فرع ← قسم ← موظف ═══
do $$ declare rid uuid := current_setting('test.dr_rule')::uuid; r2 uuid; j jsonb; ok boolean; begin
  r2 := public.it_deduction_rule_save(jsonb_build_object('name', 'dr متساهلة', 'settings', jsonb_build_object('deduct_shortfall_enabled', false, 'absent_day_deduction_days', 0.5)));
  perform set_config('test.dr_rule2', r2::text, false);
  -- فرع 1 كاملاً على المتساهلة: A يبقى على الصارمة (قسم أخص من فرع)، B يصبح متساهلة (فرع)
  perform public.it_deduction_targets_set(r2, '[{"target_type":"branch","target_id":"d1000000-0000-0000-0000-0000000000b1"}]'::jsonb);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ea', current_date); assert j ->> '_source' = 'department' and (j ->> '_rule_id')::uuid = rid, 'S3 A dept beats branch';
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000eb', current_date); assert j ->> '_source' = 'branch' and (j ->> '_rule_id')::uuid = r2, 'S3 B branch';
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ec', current_date); assert j ->> '_source' = 'default', 'S3 C other branch default';
  -- موظف A صراحةً على المتساهلة ⇒ يغلب القسم؛ وتعيين الهدف ينقله من القاعدة الأخرى
  perform public.it_deduction_targets_set(r2, '[{"target_type":"branch","target_id":"d1000000-0000-0000-0000-0000000000b1"},{"target_type":"employee","target_id":"d1000000-0000-0000-0000-0000000000ea"}]'::jsonb);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ea', current_date); assert j ->> '_source' = 'employee' and (j ->> '_rule_id')::uuid = r2, 'S3 A employee beats dept';
  perform public.it_deduction_targets_set(rid, '[{"target_type":"department","target_id":"d1000000-0000-0000-0000-0000000000c1"},{"target_type":"employee","target_id":"d1000000-0000-0000-0000-0000000000ea"}]'::jsonb);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ea', current_date); assert (j ->> '_rule_id')::uuid = rid, 'S3 target moved back to strict';
  assert (select count(*) from public.hr_deduction_rule_targets where target_type = 'employee' and target_id = 'd1000000-0000-0000-0000-0000000000ea') = 1, 'S3 one target per employee';
  -- القاعدة الافتراضية لا تقبل أهدافاً ولا تُحذف ولا تُعطَّل
  ok := false; begin perform public.it_deduction_targets_set((select id from public.hr_deduction_rules where is_default), '[{"target_type":"branch","target_id":"d1000000-0000-0000-0000-0000000000b2"}]'::jsonb); exception when others then ok := sqlerrm like '%HR_RULE_DEFAULT_NO_TARGETS%'; end; assert ok, 'S3 default no targets';
  ok := false; begin perform public.it_deduction_rule_delete((select id from public.hr_deduction_rules where is_default)); exception when others then ok := sqlerrm like '%HR_RULE_DEFAULT_REQUIRED%'; end; assert ok, 'S3 default undeletable';
  raise notice 'S3 ✅ الأسبقية: موظف ← قسم ← فرع ← افتراضي';
end $$;

-- ═══ S4 · استثناء موظف B بسبب ومدة ⇒ متوقف؛ المحرّك: يوم ناقص 40 دقيقة لـ A (صارمة: 30 د) وB (مستثنى: 0) وC (افتراضية: 60 د)؛ بصمة ناقصة لـ A = يوم غياب ═══
do $$ declare m date := current_setting('test.dr_m')::date; n int; j jsonb; a record; xid uuid; begin
  xid := public.it_deduction_exemption_add('employee', 'd1000000-0000-0000-0000-0000000000eb', 'ظرف صحي', m, null);
  perform set_config('test.dr_ex', xid::text, false);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000eb', current_date);
  assert (j ->> '_exempt')::boolean and not (j ->> 'auto_deduction_enabled')::boolean and j ->> '_exempt_reason' = 'ظرف صحي' and j ->> '_source' = 'exempt', 'S4 exempt: ' || j::text;
  reset role; perform set_config('auth.user_id', '', false);
  n := public.biometric_ingest('DR-DEV-1',
    '8401' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8401' || E'\t' || (m + 1)::text || ' 15:20:00' || E'\t1\n' ||
    '8401' || E'\t' || (m + 2)::text || ' 08:00:00' || E'\t0\n' ||
    '8402' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8402' || E'\t' || (m + 1)::text || ' 15:20:00' || E'\t1\n' ||
    '8403' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8403' || E'\t' || (m + 1)::text || ' 15:20:00' || E'\t1', 'ATTLOG');
  assert n = 7, 'S4 ingest ' || n;
  select * into a from public.hr_attendance_days where employee_id = 'd1000000-0000-0000-0000-0000000000ea' and work_date = m + 1;
  assert a.shortfall_minutes = 40 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0.5 and a.deduction_reason like '%dr صارمة%', 'S4 A strict tier (31+ ⇒ 0.5 day): ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'd1000000-0000-0000-0000-0000000000eb' and work_date = m + 1;
  assert a.shortfall_minutes = 40 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0, 'S4 B exempt ⇒ 0: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'd1000000-0000-0000-0000-0000000000ec' and work_date = m + 1;
  assert a.proposed_deduction_minutes = 120 and a.proposed_deduction_days = 0, 'S4 C default tier (36-60 ⇒ 120): ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'd1000000-0000-0000-0000-0000000000ea' and work_date = m + 2;
  assert a.status = 'incomplete' and a.proposed_deduction_days = 1 and a.deduction_reason like 'بصمة ناقصة%', 'S4 A incomplete as absent: ' || row_to_json(a)::text;
  raise notice 'S4 ✅ المحرّك يطبّق قاعدة كل موظف والاستثناء';
end $$;

-- ═══ S5 · المحاكاة: نقص 40 د بالصارمة ⇒ 0.5 يوم × 5,000 = 2,500؛ بالافتراضية براتب 600,000 ⇒ 120 د × (20,000/480) = 5,000 ═══
select auth.set_test_user('d1000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; s jsonb; begin
  select settings into s from public.hr_deduction_rules where id = current_setting('test.dr_rule')::uuid;
  j := public.it_deduction_simulate(s, 40, 480, 600000, 0, 0);
  assert (j ->> 'days')::numeric = 0.5 and (j ->> 'amount')::numeric = 2500 and j ->> 'amount_mode' = 'fixed', 'S5 strict: ' || j::text;
  j := public.it_deduction_simulate(null, 40, 480, 600000, 1, 0);
  assert (j ->> 'minutes')::int = 120 and (j ->> 'days')::numeric = 1 and (j ->> 'amount')::numeric = 25000, 'S5 default: ' || j::text;
  j := public.it_deduction_simulate(jsonb_build_object('auto_deduction_enabled', false), 40, 480, 600000, 1, 0);
  assert (j ->> 'amount')::numeric = 0 and not (j ->> 'enabled')::boolean, 'S5 disabled';
  raise notice 'S5 ✅ المحاكاة';
end $$;

-- ═══ S6 · التصدير يستعمل قاعدة كل موظف: A ثابت (fixed) باسم القاعدة، B متوقف (مستثنى)، C من الراتب؛ والمالية ترى اسم القاعدة ═══
select auth.set_test_user('d1000000-0000-0000-0000-000000000001');
select public.ops_attendance_confirm(current_setting('test.dr_m')::date);
select set_config('test.dr_export', public.ops_month_export(current_setting('test.dr_m')::date)::text, false);
do $$ declare r record; begin
  select * into r from public.hr_month_export_rows where export_id = current_setting('test.dr_export')::uuid and employee_id = 'd1000000-0000-0000-0000-0000000000ea';
  assert r.auto_deduction_basis = 'fixed' and r.auto_deduction_rule = 'dr صارمة', 'S6 A basis/rule: ' || row_to_json(r)::text;
  -- A: يوم 1 ⇒ 0.5 يوم، يوم 2 ⇒ 1 يوم، باقي الشهر غياب (1 يوم لكل يوم) ⇒ أيام × 5,000 ثابت
  assert r.auto_deduction_amount = round(r.auto_deduction_days * 5000, 2), 'S6 A fixed amount: ' || r.auto_deduction_amount || ' days ' || r.auto_deduction_days;
  select * into r from public.hr_month_export_rows where export_id = current_setting('test.dr_export')::uuid and employee_id = 'd1000000-0000-0000-0000-0000000000eb';
  assert r.auto_deduction_basis = 'disabled' and r.auto_deduction_amount = 0 and r.auto_deduction_rule = 'مستثنى', 'S6 B exempt: ' || row_to_json(r)::text;
  select * into r from public.hr_month_export_rows where export_id = current_setting('test.dr_export')::uuid and employee_id = 'd1000000-0000-0000-0000-0000000000ec';
  assert r.auto_deduction_basis = 'salary' and r.auto_deduction_rule = 'القاعدة الافتراضية' and r.auto_deduction_amount > 0, 'S6 C default: ' || row_to_json(r)::text;
  raise notice 'S6 ✅ التصدير بقاعدة كل موظف';
end $$;
select auth.set_test_user('d1000000-0000-0000-0000-000000000007');
do $$ declare r record; n_bad int; begin
  select * into r from public.finance_payroll_sheet(current_setting('test.dr_m')::date) where employee_number = 'DR-A';
  assert r.auto_deduction_rule = 'dr صارمة', 'S6b finance sees rule';
  select count(*) into n_bad from public.finance_payroll_reconcile(current_setting('test.dr_m')::date) where not money_ok;
  assert n_bad = 0, 'S6b reconcile ok';
  raise notice 'S6b ✅ المالية ترى القاعدة والتحقق سليم';
end $$;

-- ═══ S7 · الصلاحيات والسجل وإزالة الاستثناء وحذف قاعدة ═══
select auth.set_test_user('d1000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.it_deduction_rule_save(jsonb_build_object('name', 'dr غير مسموح')); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end;
  assert ok, 'S7 ops cannot write';
  assert jsonb_array_length(public.it_deduction_rules()) >= 3, 'S7 ops can read';
  assert (select count(*) from public.it_deduction_employees(null, null, null, 'dr موظف')) = 3, 'S7 ops employees view';
  raise notice 'S7 ✅ غرفة العمليات تقرأ ولا تكتب';
end $$;
select auth.set_test_user('d1000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; e record; begin
  perform public.it_deduction_exemption_remove(current_setting('test.dr_ex')::uuid);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000eb', current_date);
  assert not (j ->> '_exempt')::boolean and j ->> '_source' = 'branch', 'S7b after exemption removed';
  perform public.it_deduction_rule_delete(current_setting('test.dr_rule')::uuid);
  j := app.hr_deduction_rule_for('d1000000-0000-0000-0000-0000000000ea', current_date);
  assert j ->> '_source' = 'branch', 'S7b A falls to branch rule after strict deleted: ' || j::text;
  select * into e from public.it_deduction_employees(null, 'd1000000-0000-0000-0000-0000000000b1', null, null) where employee_number = 'DR-A';
  assert e.source = 'branch' and e.rule_name = 'dr متساهلة' and not e.exempt, 'S7b employees row: ' || row_to_json(e)::text;
  assert (select count(*) from jsonb_array_elements(public.it_deduction_audit(100)) x where x ->> 'action' in ('rule_save', 'target_set', 'exemption_add', 'exemption_remove', 'rule_delete')) >= 8, 'S7b audit entries';
  -- سياسة HR القديمة تبقى متزامنة مع القاعدة الافتراضية
  perform public.hr_policy_set('{"absent_day_deduction_days": 1.5}'::jsonb);
  assert (select (settings ->> 'absent_day_deduction_days')::numeric from public.hr_deduction_rules where is_default) = 1.5, 'S7b policy→default sync';
  perform public.it_deduction_rule_save(jsonb_build_object('id', (select id from public.hr_deduction_rules where is_default), 'name', 'القاعدة الافتراضية', 'settings', (select settings || '{"absent_day_deduction_days": 1}'::jsonb from public.hr_deduction_rules where is_default)));
  assert app.hr_policy_num('absent_day_deduction_days', 0) = 1, 'S7b default→policy sync';
  raise notice 'S7b ✅ الاستثناء والحذف والسجل والتوافق';
end $$;
reset role; select set_config('auth.user_id','', false);
