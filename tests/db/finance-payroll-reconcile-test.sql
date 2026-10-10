-- 00194 · المالية — التحقق الحسابي لكشف الرواتب: كل صف يُعاد احتسابه من مكوّناته ويُطابَق مع الحضورية الحية واستقطاعات العمليات؛
-- الاعتماد يرفض أي مخالفة حسابية؛ تعديل المالية محصور بين 0 والإجمالي. (بادئة rc)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00201: هذا الاختبار يتحقق من النموذج القديم (الراتب كاملاً ناقص الغياب)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('ac000000-0000-0000-0000-000000000001', 'rc-ops@t.iq'), ('ac000000-0000-0000-0000-000000000004', 'rc-adm@t.iq'),
  ('ac000000-0000-0000-0000-000000000006', 'rc-daily@t.iq'), ('ac000000-0000-0000-0000-000000000007', 'rc-fin@t.iq'),
  ('ac000000-0000-0000-0000-000000000009', 'rc-monthly@t.iq'), ('ac000000-0000-0000-0000-000000000010', 'rc-nosal@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ac000000-0000-0000-0000-000000000001', 'ops_room'), ('ac000000-0000-0000-0000-000000000004', 'super_admin'),
  ('ac000000-0000-0000-0000-000000000006', 'employee'), ('ac000000-0000-0000-0000-000000000007', 'finance_officer'),
  ('ac000000-0000-0000-0000-000000000009', 'employee'), ('ac000000-0000-0000-0000-000000000010', 'employee')
on conflict do nothing;
select set_config('test.rc_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
insert into public.branches (id, name, code) values ('ac000000-0000-0000-0000-0000000000b1', 'rc فرع الكرخ', 'RCK') on conflict (id) do nothing;
insert into public.departments (id, name, code) values ('ac000000-0000-0000-0000-0000000000c1', 'rc النقل', 'RCT'), ('ac000000-0000-0000-0000-0000000000c2', 'rc الإدارة', 'RCA') on conflict (id) do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin, branch_id, department_id) values
  ('ac000000-0000-0000-0000-0000000000e6', 'ac000000-0000-0000-0000-000000000006', 'rc عامل يومي', 'RC-D', '2024-01-01', '8301', 'ac000000-0000-0000-0000-0000000000b1', 'ac000000-0000-0000-0000-0000000000c1'),
  ('ac000000-0000-0000-0000-0000000000e9', 'ac000000-0000-0000-0000-000000000009', 'rc موظف شهري', 'RC-M', '2024-01-01', '8302', 'ac000000-0000-0000-0000-0000000000b1', 'ac000000-0000-0000-0000-0000000000c2'),
  ('ac000000-0000-0000-0000-0000000000ea', 'ac000000-0000-0000-0000-000000000010', 'rc بلا راتب', 'RC-N', '2024-01-01', '8303', 'ac000000-0000-0000-0000-0000000000b1', 'ac000000-0000-0000-0000-0000000000c2')
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('ac000000-0000-0000-0000-0000000000a1', 'rc شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('ac000000-0000-0000-0000-0000000000e6', 'ac000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('ac000000-0000-0000-0000-0000000000e9', 'ac000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('ac000000-0000-0000-0000-0000000000ea', 'ac000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('ac000000-0000-0000-0000-0000000000d1', 'RC-DEV-1', 'rc جهاز', '+03:00', true) on conflict (serial_number) do nothing;

-- ═══ S0 · رواتب: يومي 20,000 + نقل 15,000 · شهري 600,000 + سكن 100,000 − ضمان 30,000 · RC-N يبقى بلا ملف راتب ═══
select auth.set_test_user('ac000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  perform public.finance_salary_set('ac000000-0000-0000-0000-0000000000e6', 'daily', 0, 20000, '{"نقل": 15000}'::jsonb, '{}'::jsonb, null);
  perform public.finance_salary_set('ac000000-0000-0000-0000-0000000000e9', 'monthly', 600000, 0, '{"سكن": 100000}'::jsonb, '{"ضمان": 30000}'::jsonb, null);
  for e in select id from public.employees where archived_at is null and id <> 'ac000000-0000-0000-0000-0000000000ea'
           and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;

-- ═══ S1 · بصمات + استقطاع عمليات يدوي ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.rc_m')::date; n int; begin
  n := public.biometric_ingest('RC-DEV-1',
    '8301' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8301' || E'\t' || (m + 1)::text || ' 16:00:00' || E'\t1\n' ||
    '8301' || E'\t' || (m + 2)::text || ' 08:00:00' || E'\t0\n' || '8301' || E'\t' || (m + 2)::text || ' 16:00:00' || E'\t1\n' ||
    '8301' || E'\t' || (m + 3)::text || ' 08:00:00' || E'\t0\n' || '8301' || E'\t' || (m + 3)::text || ' 16:00:00' || E'\t1\n' ||
    '8302' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8302' || E'\t' || (m + 1)::text || ' 16:00:00' || E'\t1\n' ||
    '8302' || E'\t' || (m + 2)::text || ' 08:30:00' || E'\t0\n' || '8302' || E'\t' || (m + 2)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  assert n = 10, 'S1 ingest ' || n;
end $$;
select auth.set_test_user('ac000000-0000-0000-0000-000000000001');
select public.ops_deduction_add('ac000000-0000-0000-0000-0000000000e9', current_setting('test.rc_m')::date, 12500, 0, 'rc مخالفة');
select public.ops_attendance_confirm(current_setting('test.rc_m')::date);
select set_config('test.rc_export', public.ops_month_export(current_setting('test.rc_m')::date)::text, false);
do $$ begin raise notice 'S1 ✅ بصمات + استقطاع + اعتماد الحضورية + تصدير'; end $$;

-- ═══ S2 · التحقق: كل الصفوف ذات الراتب متطابقة مالياً وحضورياً؛ المكوّنات تُفسّر الرقم؛ RC-N يُعلَّم SALARY_MISSING فقط ═══
select auth.set_test_user('ac000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.rc_m')::date; r record; n_bad int; n_all int; begin
  select count(*) into n_all from public.finance_payroll_reconcile(m);
  assert n_all >= 3, 'S2 rows ' || n_all;
  select count(*) into n_bad from public.finance_payroll_reconcile(m) where not money_ok;
  assert n_bad = 0, 'S2 money mismatches: ' || n_bad;
  select count(*) into n_bad from public.finance_payroll_reconcile(m) where not attendance_ok;
  assert n_bad = 0, 'S2 attendance mismatches: ' || n_bad || ' ' || (select string_agg(employee_number || ':' || array_to_string(issues, '/') || ' c=' || components::text || ' l=' || live::text, ' || ') from public.finance_payroll_reconcile(m) where not attendance_ok);
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'RC-M';
  assert r.ok and r.gross_stored = 700000 and r.gross_expected = 700000, 'S2 monthly gross: ' || row_to_json(r)::text;
  assert r.deductions_stored = r.deductions_expected and r.deductions_expected = 30000 + 12500 + (r.components ->> 'auto_amount')::numeric, 'S2 monthly deductions: ' || row_to_json(r)::text;
  assert r.net_stored = r.net_expected and r.net_expected = 700000 - r.deductions_expected, 'S2 monthly net';
  assert (r.live ->> 'ops_amount')::numeric = 12500 and (r.live ->> 'present')::int = 2, 'S2 live: ' || r.live::text;
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'RC-D';
  assert r.ok and r.gross_expected = 20000 * 3 + 15000 and r.gross_stored = r.gross_expected, 'S2 daily gross: ' || row_to_json(r)::text;
  assert r.branch_name = 'rc فرع الكرخ' and r.department_name = 'rc النقل', 'S2 branch/dept';
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'RC-N';
  assert not r.ok and r.money_ok and r.issues = array['SALARY_MISSING'], 'S2 no-salary row: ' || array_to_string(r.issues, ',');
  assert r.gross_expected is null and r.net_expected is null, 'S2 no-salary nulls';
  raise notice 'S2 ✅ التحقق الحسابي متطابق (شهري 700,000 − % · يومي 75,000)', r.deductions_expected;
end $$;

-- ═══ S3 · تعديل المالية محصور: سالب ✗ · فوق الإجمالي ✗ · بلا سبب ✗ · صحيح ✓ ويبقى التحقق سليماً ═══
do $$ declare m date := current_setting('test.rc_m')::date; rid uuid; ok boolean; r record; begin
  select row_id into rid from public.finance_payroll_reconcile(m) where employee_number = 'RC-M';
  ok := false; begin perform public.finance_payroll_adjust(rid, -1, 'خطأ'); exception when others then ok := sqlerrm like '%HR_AMOUNT_INVALID%'; end; assert ok, 'S3 negative';
  ok := false; begin perform public.finance_payroll_adjust(rid, 700001, 'فوق'); exception when others then ok := sqlerrm like '%HR_FINAL_ABOVE_GROSS%'; end; assert ok, 'S3 above gross';
  ok := false; begin perform public.finance_payroll_adjust(rid, 650000, '  '); exception when others then ok := sqlerrm like '%HR_REASON_REQUIRED%'; end; assert ok, 'S3 reason';
  perform public.finance_payroll_adjust(rid, 650000, 'مكافأة استثنائية');
  select * into r from public.finance_payroll_reconcile(m) where row_id = rid;
  assert r.final_net = 650000 and r.money_ok and r.net_stored = r.net_expected, 'S3 after adjust: ' || row_to_json(r)::text;
  raise notice 'S3 ✅ تعديل المالية';
end $$;

-- ═══ S4 · عبث مباشر بالصافي (محاكاة خلل) ⇒ NET_MISMATCH والاعتماد مرفوض HR_PAYROLL_RECONCILE_MISMATCH؛ الاستعادة تعيد السلامة ═══
select auth.set_test_user('ac000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.rc_m')::date; rid uuid; old numeric; r record; ok boolean; begin
  select row_id, net_stored into rid, old from public.finance_payroll_reconcile(m) where employee_number = 'RC-D';
  update public.hr_month_export_rows set proposed_net = proposed_net + 1000 where id = rid;
  select * into r from public.finance_payroll_reconcile(m) where row_id = rid;
  assert not r.money_ok and 'NET_MISMATCH' = any (r.issues) and r.net_expected = old, 'S4 mismatch detected: ' || array_to_string(r.issues, ',');
  ok := false; begin perform public.finance_payroll_approve(current_setting('test.rc_export')::uuid, false); exception when others then ok := sqlerrm like '%HR_PAYROLL_RECONCILE_MISMATCH%'; end;
  assert ok, 'S4 approve must refuse mismatch';
  update public.hr_month_export_rows set proposed_net = old where id = rid;
  assert (select money_ok from public.finance_payroll_reconcile(m) where row_id = rid), 'S4 restored';
  raise notice 'S4 ✅ صمام الأمان الحسابي';
end $$;

-- ═══ S5 · استقطاع عمليات جديد بعد التصدير ⇒ OPS_DEDUCTIONS_CHANGED (حضورياً) مع بقاء السلامة المالية؛ إعادة الاعتماد والتصدير تُصفّي الفرق ═══
select auth.set_test_user('ac000000-0000-0000-0000-000000000001');
select public.ops_attendance_reopen(current_setting('test.rc_m')::date, 'rc استقطاع متأخر');
select public.ops_deduction_add('ac000000-0000-0000-0000-0000000000e6', current_setting('test.rc_m')::date, 5000, 0, 'rc تأخير متكرر');
select auth.set_test_user('ac000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.rc_m')::date; r record; begin
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'RC-D';
  assert r.money_ok and not r.attendance_ok and 'OPS_DEDUCTIONS_CHANGED' = any (r.issues) and (r.live ->> 'ops_amount')::numeric = 5000, 'S5 live diff: ' || row_to_json(r)::text;
  raise notice 'S5 ✅ كشف فروق ما بعد التصدير';
end $$;
select auth.set_test_user('ac000000-0000-0000-0000-000000000001');
select public.ops_attendance_confirm(current_setting('test.rc_m')::date);
select set_config('test.rc_export', public.ops_month_export(current_setting('test.rc_m')::date)::text, false);
select auth.set_test_user('ac000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.rc_m')::date; r record; n_bad int; begin
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'RC-D';
  assert r.ok and r.deductions_expected = 5000 and r.net_stored = 75000 - 5000, 'S5b re-export: ' || row_to_json(r)::text;
  select count(*) into n_bad from public.finance_payroll_reconcile(m) where not attendance_ok;
  assert n_bad = 0, 'S5b attendance all ok';
  raise notice 'S5b ✅ بعد إعادة التصدير: الصافي اليومي 70,000';
end $$;

-- ═══ S6 · تعريف راتب RC-N ثم إعادة التصدير ⇒ لا مخالفات؛ الاعتماد يمر؛ والتحقق يبقى متاحاً للكشف المعتمد ═══
select public.finance_salary_set('ac000000-0000-0000-0000-0000000000ea', 'monthly', 400000, 0, '{}', '{}', null);
select auth.set_test_user('ac000000-0000-0000-0000-000000000001');
select public.ops_attendance_reopen(current_setting('test.rc_m')::date, 'rc تعريف راتب');
select public.ops_attendance_confirm(current_setting('test.rc_m')::date);
select set_config('test.rc_export', public.ops_month_export(current_setting('test.rc_m')::date)::text, false);
select auth.set_test_user('ac000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.rc_m')::date; n_bad int; r record; begin
  select count(*) into n_bad from public.finance_payroll_reconcile(m) where not ok;
  assert n_bad = 0, 'S6 all ok before approve: ' || n_bad;
  perform public.finance_payroll_approve(current_setting('test.rc_export')::uuid, false);
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'RC-N';
  assert r.ok and r.gross_stored = 400000, 'S6 after approve: ' || row_to_json(r)::text;
  assert (select status from public.hr_month_exports where id = current_setting('test.rc_export')::uuid) = 'approved', 'S6 approved';
  raise notice 'S6 ✅ الاعتماد بعد اكتمال الملفات وسلامة التحقق';
end $$;
reset role; select set_config('auth.user_id','', false);
