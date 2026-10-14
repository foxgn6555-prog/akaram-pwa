-- 00225 · سلسلة الرواتب: تعريف المالية لراتب موظف بعد تصدير غرفة العمليات يحدّث صفّه في الكشف المفتوح تلقائياً (بلا إعادة تصدير)،
-- لا يمسّ الكشوف المعتمدة/المقفلة، ولا يُعلَّم الكشف «قديماً»؛ وغرفة العمليات بلا استقطاع. (بادئة sr)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('ce000000-0000-0000-0000-000000000001', 'sr-ops@t.iq'), ('ce000000-0000-0000-0000-000000000003', 'sr-dep@t.iq'),
  ('ce000000-0000-0000-0000-000000000007', 'sr-fin@t.iq'), ('ce000000-0000-0000-0000-000000000009', 'sr-m@t.iq'), ('ce000000-0000-0000-0000-000000000010', 'sr-n@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ce000000-0000-0000-0000-000000000001', 'ops_room'), ('ce000000-0000-0000-0000-000000000003', 'deputy_director'), ('ce000000-0000-0000-0000-000000000007', 'finance_officer'),
  ('ce000000-0000-0000-0000-000000000009', 'employee'), ('ce000000-0000-0000-0000-000000000010', 'employee')
on conflict do nothing;
select set_config('test.sr_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
insert into public.branches (id, name, code) values ('ce000000-0000-0000-0000-0000000000b1', 'sr فرع', 'SRB') on conflict (id) do nothing;
insert into public.departments (id, name, code) values ('ce000000-0000-0000-0000-0000000000c1', 'sr قسم', 'SRC') on conflict (id) do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin, branch_id, department_id) values
  ('ce000000-0000-0000-0000-0000000000e9', 'ce000000-0000-0000-0000-000000000009', 'sr موظف مُسعَّر', 'SR-M', '2024-01-01', '8401', 'ce000000-0000-0000-0000-0000000000b1', 'ce000000-0000-0000-0000-0000000000c1'),
  ('ce000000-0000-0000-0000-0000000000ea', 'ce000000-0000-0000-0000-000000000010', 'sr بلا راتب وقت التصدير', 'SR-N', '2024-01-01', '8402', 'ce000000-0000-0000-0000-0000000000b1', 'ce000000-0000-0000-0000-0000000000c1')
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('ce000000-0000-0000-0000-0000000000a1', 'sr شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('ce000000-0000-0000-0000-0000000000e9', 'ce000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('ce000000-0000-0000-0000-0000000000ea', 'ce000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('ce000000-0000-0000-0000-0000000000d1', 'SR-DEV-1', 'sr جهاز', '+03:00', true) on conflict (serial_number) do nothing;

-- S0 · راتب للأول فقط + بصمات للاثنين
select auth.set_test_user('ce000000-0000-0000-0000-000000000007');
select public.finance_salary_set('ce000000-0000-0000-0000-0000000000e9', 'monthly', 600000, 0, '{}'::jsonb, '{}'::jsonb, null);
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.sr_m')::date; n int; begin
  n := public.biometric_ingest('SR-DEV-1',
    '8401' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8401' || E'\t' || (m + 1)::text || ' 16:00:00' || E'\t1\n' ||
    '8402' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8402' || E'\t' || (m + 1)::text || ' 16:00:00' || E'\t1\n' ||
    '8402' || E'\t' || (m + 2)::text || ' 08:00:00' || E'\t0\n' || '8402' || E'\t' || (m + 2)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  assert n = 6, 'S0 ingest ' || n;
end $$;

-- S1 · غرفة العمليات: لا استقطاع · اعتماد الحضورية · تصدير ⇒ صف SR-N بلا راتب
select auth.set_test_user('ce000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.sr_m')::date; x uuid; r record; ok boolean := false; begin
  begin perform public.ops_deduction_add('ce000000-0000-0000-0000-0000000000e9', m, 1000, 0, 'سبب'); exception when others then ok := sqlerrm = 'OPS_DEDUCTION_DISABLED'; end;
  assert ok, 'S1 ops cannot deduct';
  perform public.ops_attendance_confirm(m);
  x := public.ops_month_export(m);
  perform set_config('test.sr_export', x::text, false);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'ce000000-0000-0000-0000-0000000000ea';
  assert r.pay_type is null and r.gross_amount is null and r.proposed_net is null and r.days_present = 2, 'S1 SR-N missing salary row: ' || row_to_json(r)::text;
  raise notice 'S1 ✅ التصدير يحمل صفاً بلا ملف راتب';
end $$;

-- S2 · المالية تعرّف الراتب بعد التصدير ⇒ الصف يتحدّث فوراً داخل التصدير نفسه (لا إصدار جديد، لا «كشف قديم»)
select auth.set_test_user('ce000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.sr_m')::date; x uuid := current_setting('test.sr_export')::uuid; r record; st jsonb; n int; begin
  perform public.finance_salary_set('ce000000-0000-0000-0000-0000000000ea', 'daily', 0, 25000, '{}'::jsonb, '{}'::jsonb, null);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'ce000000-0000-0000-0000-0000000000ea';
  assert r.pay_type = 'daily' and r.daily_rate = 25000 and r.gross_amount = 50000 and r.proposed_net = 50000 and r.final_net = 50000 and r.days_present = 2, 'S2 refreshed row: ' || row_to_json(r)::text;
  select count(*) into n from public.hr_month_export_rows where export_id = x; assert n = (select rows_count from public.hr_month_exports where id = x), 'S2 rows_count stable ' || n;
  assert (select count(*) from public.hr_month_exports where period_month = m) = 1, 'S2 no new export version';
  select count(*) into n from public.hr_month_export_rows where export_id = x and pay_type is null; assert n = 0, 'S2 no missing rows left';
  st := app.hr_month_export_status(m);
  assert not (st ->> 'needs_reexport')::boolean and st ->> 'review_status' = 'pending', 'S2 not stale, awaiting deputy: ' || st::text;
  -- إعادة تعريف الراتب نفسه لاحقاً لا تُعيد بناء الصف (الصف لم يعد «بلا راتب»)
  perform public.finance_salary_set('ce000000-0000-0000-0000-0000000000ea', 'daily', 0, 30000, '{}'::jsonb, '{}'::jsonb, null);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'ce000000-0000-0000-0000-0000000000ea';
  assert r.daily_rate = 25000, 'S2 priced row untouched: ' || r.daily_rate;
  raise notice 'S2 ✅ تعريف الراتب بعد التصدير يحدّث الصف دون إعادة تصدير';
end $$;

-- S3 · معاون المدير المفوض يعتمد ⇒ المالية ترى الصف مُسعَّراً وتعتمد؛ بعد القفل لا يتغير شيء
select auth.set_test_user('ce000000-0000-0000-0000-000000000003');
select public.deputy_payroll_approve(current_setting('test.sr_export')::uuid);
select auth.set_test_user('ce000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.sr_m')::date; x uuid := current_setting('test.sr_export')::uuid; f record; n int; begin
  select * into f from public.finance_payroll_sheet(m) s where s.employee_id = 'ce000000-0000-0000-0000-0000000000ea';
  assert f.pay_type = 'daily' and f.final_net = 50000, 'S3 finance sees priced row: ' || row_to_json(f)::text;
  select count(*) into n from public.finance_payroll_sheet(m) s where s.pay_type is null; assert n = 0, 'S3 finance missing=0';
  perform public.finance_payroll_approve(x, false);
  assert app.hr_month_locked(m), 'S3 locked';
  -- تعريف/تعديل راتب بعد القفل لا يمسّ الكشف المعتمد
  update public.hr_month_export_rows set pay_type = null where export_id = x and employee_id = 'ce000000-0000-0000-0000-0000000000e9';
  perform public.finance_salary_set('ce000000-0000-0000-0000-0000000000e9', 'monthly', 700000, 0, '{}'::jsonb, '{}'::jsonb, null);
  select count(*) into n from public.hr_month_export_rows where export_id = x and employee_id = 'ce000000-0000-0000-0000-0000000000e9' and pay_type is null;
  assert n = 1, 'S3 approved export untouched';
  raise notice 'S3 ✅ السلسلة: عمليات → معاون → مالية، والمقفل لا يُمسّ';
end $$;

-- S4 · 00226: حالة التصدير تحمل مرحلة المعاون (كان pending قبل اعتماده ثم approved) — لغرفة العمليات كي تعرض المسار الصحيح
do $$ declare m date := current_setting('test.sr_m')::date; st jsonb; begin
  st := app.hr_month_export_status(m);
  assert st ->> 'review_status' = 'approved' and st ->> 'reviewed_at' is not null and st ->> 'status' = 'approved', 'S4 status carries review stage: ' || st::text;
  raise notice 'S4 ✅ حالة التصدير تبيّن مرحلة معاون المدير المفوض';
end $$;
