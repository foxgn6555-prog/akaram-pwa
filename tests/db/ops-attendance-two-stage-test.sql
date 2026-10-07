-- 00193 — وحدة الحضوريات بمرحلتين: التدقيق التفصيلي → اعتماد الشهر → الكشف المعتمد → التصدير للمالية (بادئة ts)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('fc000000-0000-0000-0000-000000000001', 'ts-ops@t.iq'), ('fc000000-0000-0000-0000-000000000002', 'ts-hr@t.iq'), ('fc000000-0000-0000-0000-000000000004', 'ts-adm@t.iq'),
  ('fc000000-0000-0000-0000-000000000005', 'ts-mgr@t.iq'), ('fc000000-0000-0000-0000-000000000006', 'ts-e1@t.iq'), ('fc000000-0000-0000-0000-000000000007', 'ts-fin@t.iq'),
  ('fc000000-0000-0000-0000-000000000008', 'ts-it@t.iq'), ('fc000000-0000-0000-0000-000000000009', 'ts-e2@t.iq'), ('fc000000-0000-0000-0000-000000000010', 'ts-emp-other@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fc000000-0000-0000-0000-000000000001', 'ops_room'), ('fc000000-0000-0000-0000-000000000002', 'hr_officer'), ('fc000000-0000-0000-0000-000000000004', 'super_admin'),
  ('fc000000-0000-0000-0000-000000000005', 'department_manager'), ('fc000000-0000-0000-0000-000000000006', 'employee'), ('fc000000-0000-0000-0000-000000000007', 'finance_officer'),
  ('fc000000-0000-0000-0000-000000000008', 'it_admin'), ('fc000000-0000-0000-0000-000000000009', 'employee'), ('fc000000-0000-0000-0000-000000000010', 'employee')
on conflict do nothing;
insert into public.departments (id, name, code) values ('fc000000-0000-0000-0000-0000000000c1', 'ts قسم الإدارة', 'TS-ADM'), ('fc000000-0000-0000-0000-0000000000c2', 'ts قسم الآليات', 'TS-MEC') on conflict (id) do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin, department_id) values
  ('fc000000-0000-0000-0000-0000000000e5', 'fc000000-0000-0000-0000-000000000005', 'ts مدير', 'TS-MGR', '2024-01-01', 'TS-M', 'fc000000-0000-0000-0000-0000000000c1'),
  ('fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-000000000006', 'ts موظف الإدارة', 'TS-1', '2024-01-01', '8301', 'fc000000-0000-0000-0000-0000000000c1'),
  ('fc000000-0000-0000-0000-0000000000e9', 'fc000000-0000-0000-0000-000000000009', 'ts سائق الآليات', 'TS-2', '2024-01-01', '8302', 'fc000000-0000-0000-0000-0000000000c2')
on conflict (id) do nothing;
update public.employees set manager_id = 'fc000000-0000-0000-0000-0000000000e5' where id in ('fc000000-0000-0000-0000-0000000000e6', 'fc000000-0000-0000-0000-0000000000e9');
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('fc000000-0000-0000-0000-0000000000a1', 'ts شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,6}') on conflict (name) do nothing;   -- الجمعة راحة
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select id, 'fc000000-0000-0000-0000-0000000000a1', '2024-01-01' from public.employees where employee_number like 'TS-%' on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('fc000000-0000-0000-0000-0000000000d1', 'TS-DEV-1', 'ts جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.ts_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 600000, 0, '{}', '{}', null);
  end loop;
end $$;

-- ═══ S1 · بصمات + إجازة معتمدة؛ الشبكة الشهرية تُرجع صفاً لكل موظف بالترتيب (القسم ثم الاسم) وخلية لكل يوم بالأوقات ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.ts_m')::date; n int; begin
  n := public.biometric_ingest('TS-DEV-1',
    '8301' || E'\t' || (m + 1)::text || ' 08:02:00' || E'\t0\n' || '8301' || E'\t' || (m + 1)::text || ' 16:05:00' || E'\t1\n' ||
    '8301' || E'\t' || (m + 2)::text || ' 08:45:00' || E'\t0\n' || '8301' || E'\t' || (m + 2)::text || ' 16:00:00' || E'\t1\n' ||
    '8301' || E'\t' || (m + 3)::text || ' 08:00:00' || E'\t0\n' ||
    '8302' || E'\t' || (m + 1)::text || ' 07:55:00' || E'\t0\n' || '8302' || E'\t' || (m + 1)::text || ' 16:10:00' || E'\t1', 'ATTLOG');
  assert n = 7, 'S1 ingest';
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000006');
do $$ declare m date := current_setting('test.ts_m')::date; t uuid; l uuid; begin
  select id into t from public.hr_leave_types where code = 'annual';
  l := public.hr_leave_request('fc000000-0000-0000-0000-0000000000e6', t, m + 4, m + 5, null, null, 'سفر');
  perform set_config('test.ts_l1', l::text, false);
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000005');
select public.hr_leave_decide(current_setting('test.ts_l1')::uuid, true, null);
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ts_m')::date; g record; c jsonb; names text[]; begin
  select array_agg(department_name order by ord) into names from (select department_name, row_number() over () ord from public.ops_attendance_month_grid(m)) x;
  assert names = array['ts قسم الآليات', 'ts قسم الإدارة', 'ts قسم الإدارة'], 'S1 grouped by department: ' || names::text;
  assert (select count(*) from public.ops_attendance_month_grid(m, null, 'fc000000-0000-0000-0000-0000000000c2')) = 1, 'S1 department filter';
  assert (select count(*) from public.ops_attendance_month_grid(m, null, null, 'TS-1')) = 1, 'S1 search';
  select * into g from public.ops_attendance_month_grid(m) x where x.employee_number = 'TS-1';
  assert jsonb_array_length(g.days) = extract(day from (m + interval '1 month' - interval '1 day'))::int, 'S1 one cell per day';
  c := g.days -> 1;  assert c ->> 's' = 'present' and c ->> 'in' = '08:02' and c ->> 'out' = '16:05' and (c ->> 'w')::int = 483, 'S1 cell d1: ' || c::text;
  c := g.days -> 2;  assert c ->> 's' = 'late' and (c ->> 'late')::int = 35, 'S1 cell d2: ' || c::text;
  c := g.days -> 3;  assert c ->> 's' = 'incomplete' and c ->> 'out' is null, 'S1 cell d3: ' || c::text;
  c := g.days -> 4;  assert c ->> 's' = 'leave', 'S1 cell d4 leave: ' || c::text;
  assert g.present_days = 1 and g.late_days = 1 and g.incomplete_days = 1 and g.leave_days = 2 and g.worked_minutes = 483 + 435, 'S1 totals: ' || row_to_json(g)::text;
  assert g.unevaluated_days > 0 and (select count(*) from jsonb_array_elements(g.days) d where d ->> 's' = 'pending') = g.unevaluated_days, 'S1 pending days flagged';
  raise notice 'S1 ✅ الشبكة الشهرية (المرحلة 1)';
end $$;
-- الموظف العادي لا يرى الشبكة
select auth.set_test_user('fc000000-0000-0000-0000-000000000010');
do $$ begin assert (select count(*) from public.ops_attendance_month_grid(current_setting('test.ts_m')::date)) = 0, 'S1 employee cannot read grid'; end $$;

-- ═══ S2 · لا تصدير قبل الاعتماد؛ الاعتماد يحتسب الشهر كاملاً (الأيام بلا بصمة = غياب، الجمعة راحة) ويصوّر الملخص ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ts_m')::date; ok boolean := false; cf jsonb; g record; begin
  cf := public.ops_attendance_confirmation(m);
  assert cf ->> 'status' = 'open' and not (cf ->> 'confirmed')::boolean and not (cf ->> 'can_export')::boolean and (cf ->> 'required')::boolean, 'S2 open: ' || cf::text;
  begin perform public.ops_month_export(m); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_NOT_CONFIRMED'; end;
  assert ok, 'S2 export blocked';
  ok := false; begin perform public.ops_attendance_confirm((date_trunc('month', current_date) + interval '1 month')::date); exception when others then ok := sqlerrm = 'HR_MONTH_FUTURE'; end;
  assert ok, 'S2 future month';
  cf := public.ops_attendance_confirm(m);
  assert (cf ->> 'confirmed')::boolean and (cf ->> 'can_export')::boolean and (cf ->> 'unevaluated_days')::int = 0 and (cf ->> 'confirm_count')::int = 1 and cf ->> 'confirmed_by_name' is not null, 'S2 confirmed: ' || cf::text;
  select * into g from public.ops_attendance_month_grid(m) x where x.employee_number = 'TS-1';
  assert g.unevaluated_days = 0 and g.absent_days > 0 and g.rest_days = (select count(*) from generate_series(m, (m + interval '1 month - 1 day')::date, '1 day') d where extract(dow from d) = 5), 'S2 month evaluated: ' || row_to_json(g)::text;
  assert (cf -> 'snapshot' ->> 'days_present')::int >= 2 and (cf -> 'snapshot' ->> 'days_absent')::int = (select sum(absent_days) from public.ops_attendance_month_grid(m)), 'S2 snapshot matches grid';
  assert (select count(*) from public.hr_attendance_audit where action = 'confirm' and work_date = m) = 3, 'S2 audit per employee';
  raise notice 'S2 ✅ الاعتماد';
end $$;
-- الموظف العادي / المالية: لا اعتماد ولا إعادة فتح
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
do $$ declare ok boolean := false; begin
  begin perform public.ops_attendance_confirm(current_setting('test.ts_m')::date); exception when others then ok := sqlerrm = 'HR_FORBIDDEN'; end; assert ok, 'S2 finance cannot confirm';
  ok := false; begin perform public.ops_attendance_reopen(current_setting('test.ts_m')::date, 'سبب'); exception when others then ok := sqlerrm = 'HR_FORBIDDEN'; end; assert ok, 'S2 finance cannot reopen';
  assert (public.ops_attendance_confirmation(current_setting('test.ts_m')::date) ->> 'confirmed')::boolean, 'S2 finance can read status';
end $$;

-- ═══ S3 · بعد الاعتماد: كل تعديل يدوي ممنوع (تعديل/إعفاء/إعادة احتساب/استقطاع/حذف استقطاع)؛ البصمة المتأخرة تُعلَّق لا تُطبَّق ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ts_m')::date; ok boolean; e uuid := 'fc000000-0000-0000-0000-0000000000e6'; cf jsonb; n int; before_status text; begin
  ok := false; begin perform public.ops_attendance_edit(e, m + 3, ((m + 3)::text || ' 08:00')::timestamp at time zone 'Asia/Baghdad', ((m + 3)::text || ' 16:00')::timestamp at time zone 'Asia/Baghdad', 'present', 'تصحيح'); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_CONFIRMED'; end;
  assert ok, 'S3 edit blocked';
  ok := false; begin perform public.ops_deduction_waive(e, m + 2, true, 'سبب'); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_CONFIRMED'; end;
  assert ok, 'S3 waive blocked';
  ok := false; begin perform public.ops_deduction_add(e, m, 1000, 0, 'سبب'); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_CONFIRMED'; end;
  assert ok, 'S3 deduction blocked';
  ok := false; begin perform public.ops_attendance_reset(e, m + 3, 'سبب'); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_CONFIRMED'; end;
  assert ok, 'S3 reset blocked';
  -- بصمة متأخرة تصل بعد الاعتماد ليوم كان غياباً: تُخزَّن، اليوم لا يتغيّر، تُعلَّق
  select status into before_status from public.hr_attendance_days where employee_id = e and work_date = m + 8;
  assert before_status = 'absent', 'S3 d8 absent before';
  perform set_config('auth.user_id', '', false); reset role;
  n := public.biometric_ingest('TS-DEV-1', '8301' || E'\t' || (m + 8)::text || ' 08:00:00' || E'\t0\n' || '8301' || E'\t' || (m + 8)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  perform auth.set_test_user('fc000000-0000-0000-0000-000000000001');
  assert n = 2 and (select status from public.hr_attendance_days where employee_id = e and work_date = m + 8) = 'absent', 'S3 late punch not applied while confirmed';
  cf := public.ops_attendance_confirmation(m);
  assert (cf ->> 'pending_auto')::int = 1 and not (cf ->> 'can_export')::boolean, 'S3 pending auto: ' || cf::text;
  assert exists (select 1 from public.hr_attendance_audit where employee_id = e and work_date = m + 8 and action = 'auto_blocked' and after ->> 'status' = 'present'), 'S3 blocked change audited with what it would have been';
  ok := false; begin perform public.ops_month_export(m); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_NOT_CONFIRMED'; end;
  assert ok, 'S3 export blocked while pending';
  -- إعادة الاعتماد تطبّق المعلّق وتصفّر العدّاد (بلا إعادة فتح لأن لا تعديل يدوي)
  cf := public.ops_attendance_confirm(m);
  assert (cf ->> 'pending_auto')::int = 0 and (cf ->> 'can_export')::boolean and (cf ->> 'confirm_count')::int = 2, 'S3 reconfirm: ' || cf::text;
  assert (select status from public.hr_attendance_days where employee_id = e and work_date = m + 8) = 'present', 'S3 pending punch applied on reconfirm';
  raise notice 'S3 ✅ الحماية بعد الاعتماد + تعليق التغييرات التلقائية';
end $$;

-- ═══ S4 · إعادة الفتح بسبب (يُبلَّغ التطوير) ⇒ التعديل يعمل ثم اعتماد جديد؛ الكشف المعتمد يعرض حاضر/غائب/مجاز فقط عبر الحالات ═══
do $$ declare m date := current_setting('test.ts_m')::date; e uuid := 'fc000000-0000-0000-0000-0000000000e6'; cf jsonb; g record; ok boolean := false; begin
  cf := public.ops_attendance_reopen(m, 'تصحيح بصمة خروج يوم 3 بعد مراجعة مسؤول القسم');
  assert cf ->> 'status' = 'reopened' and cf ->> 'reopen_reason' like 'تصحيح%' and not (cf ->> 'can_export')::boolean, 'S4 reopened: ' || cf::text;
  assert exists (select 1 from public.notifications where user_id = 'fc000000-0000-0000-0000-000000000008' and title like 'إعادة فتح حضورية%' and body like '%تصحيح بصمة%'), 'S4 IT notified';
  assert exists (select 1 from public.hr_attendance_audit where action = 'reopen' and work_date = m and reason like 'تصحيح%'), 'S4 reopen audited';
  perform public.ops_attendance_edit(e, m + 3, ((m + 3)::text || ' 08:00')::timestamp at time zone 'Asia/Baghdad', ((m + 3)::text || ' 16:00')::timestamp at time zone 'Asia/Baghdad', 'present', 'عطل جهاز عند الخروج');
  perform public.ops_deduction_waive(e, m + 2, true, 'حاجز أمني');
  begin perform public.ops_attendance_reopen(m, 'مرة ثانية'); exception when others then ok := sqlerrm = 'HR_ATTENDANCE_NOT_CONFIRMED'; end;
  assert ok, 'S4 cannot reopen an already-open month';
  cf := public.ops_attendance_confirm(m);
  assert (cf ->> 'confirm_count')::int = 3 and (cf ->> 'can_export')::boolean, 'S4 reconfirmed';
  select * into g from public.ops_attendance_month_grid(m) x where x.employee_number = 'TS-1';
  assert g.incomplete_days = 0 and g.present_days = 3 and (g.days -> 3 ->> 'src') = 'manual' and (g.days -> 2 ->> 'waived')::boolean, 'S4 grid reflects edits: ' || row_to_json(g)::text;
  -- المرحلة 2: كل حالة تُختزل إلى حاضر/غائب/مجاز (التحقق من أن الشبكة تحمل الحالات اللازمة للاختزال)
  assert (select count(*) from jsonb_array_elements(g.days) d where d ->> 's' not in ('present', 'late', 'early_leave', 'incomplete', 'absent', 'leave', 'time_permit', 'pending', 'future', 'none', 'rest')) = 0, 'S4 statuses reducible';
  raise notice 'S4 ✅ إعادة الفتح → تعديل → اعتماد';
end $$;

-- ═══ S5 · كشف معتمد بعد الاعتماد: الاستقطاع يُسمح (من السلسلة) ويُعدّ «بعد الاعتماد»؛ التصدير يمر ثم كشف المالية = الشبكة ═══
do $$ declare m date := current_setting('test.ts_m')::date; j jsonb; begin
  j := public.disclosure_save(null::uuid, jsonb_build_object('target_kind', 'employee', 'employee_id', 'fc000000-0000-0000-0000-0000000000e9', 'violation_type', 'absence', 'penalty_type', 'reprimand', 'details', 'غياب', 'log_date', (m + 9)::text, 'amount', 2500));
  perform set_config('test.ts_disc', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.ts_disc')::uuid);
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.ts_m')::date; j jsonb; cf jsonb; begin
  j := public.disclosure_decide(current_setting('test.ts_disc')::uuid, true, null, null);
  if j ->> 'status' = 'pending' then j := public.disclosure_decide(current_setting('test.ts_disc')::uuid, true, null, null); end if;
  assert j ->> 'status' = 'approved' and (j ->> 'deduction_posted')::boolean, 'S5 disclosure posted while confirmed: ' || j::text;
  cf := public.ops_attendance_confirmation(m);
  assert (cf ->> 'deductions_after')::int = 1 and (cf ->> 'can_export')::boolean, 'S5 deduction counted, export still allowed: ' || cf::text;
end $$;
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ts_m')::date; x uuid; r record; g record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'TS-2';
  assert r.ops_deduction_amount = 2500, 'S5 export carries disclosure';
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'TS-1';
  select * into g from public.ops_attendance_month_grid(m) y where y.employee_number = 'TS-1';
  assert r.days_present = g.present_days + g.late_days + g.early_days and r.days_absent = g.absent_days and r.days_leave = g.leave_days and r.days_incomplete = g.incomplete_days
     and r.auto_deduction_minutes = g.proposed_minutes and r.auto_deduction_days = g.proposed_days, 'S5 export row = grid totals: ' || row_to_json(r)::text || ' vs ' || row_to_json(g)::text;
  raise notice 'S5 ✅ التصدير بعد الاعتماد = الشبكة';
end $$;

-- ═══ S6 · اعتماد المالية ⇒ قفل: لا اعتماد ولا إعادة فتح؛ الحالة تعكس القفل ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000007');
select public.finance_payroll_approve((select id from public.hr_month_exports where period_month = current_setting('test.ts_m')::date and status = 'exported'), false);
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ts_m')::date; ok boolean := false; cf jsonb; begin
  cf := public.ops_attendance_confirmation(m);
  assert (cf ->> 'locked')::boolean and not (cf ->> 'can_export')::boolean and cf -> 'export' ->> 'status' = 'approved', 'S6 locked status: ' || cf::text;
  begin perform public.ops_attendance_reopen(m, 'محاولة'); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S6 reopen blocked';
  ok := false; begin perform public.ops_attendance_confirm(m); exception when others then ok := sqlerrm = 'HR_MONTH_LOCKED'; end; assert ok, 'S6 confirm blocked';
  raise notice 'S6 ✅ القفل';
end $$;

-- ═══ S7 · التطوير المركزية تعطّل الشرط (سياسة) ⇒ التصدير يمر بلا اعتماد للشهر الحالي؛ الاعتماد يرفض شهراً فيه أيام غير محتسبة؟ (يحتسبها بنفسه) ═══
select auth.set_test_user('fc000000-0000-0000-0000-000000000008');
select public.hr_policy_set('{"require_attendance_confirmation": false}'::jsonb);
select auth.set_test_user('fc000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; cf jsonb; x uuid; begin
  cf := public.ops_attendance_confirmation(m);
  assert not (cf ->> 'required')::boolean and (cf ->> 'can_export')::boolean and cf ->> 'status' = 'open', 'S7 policy off: ' || cf::text;
  x := public.ops_month_export(m);
  assert x is not null, 'S7 export without confirmation when policy off';
  raise notice 'S7 ✅ السياسة من التطوير المركزية';
end $$;
reset role; select set_config('auth.user_id','', false);
