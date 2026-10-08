-- 00196 · طرق احتساب النقص (شرائح/دقيقة بدقيقة/مضاعف/كتل) · المحاكاة التفصيلية · دقة الإجازات والزمنيات المدفوعة (بادئة dm)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"backdated_max_days": 365}'::jsonb where id = 1;  -- 00197: الاختبار يطلب لأشهر ماضية
insert into auth.users (id, email) values
  ('d2000000-0000-0000-0000-000000000001', 'dm-ops@t.iq'), ('d2000000-0000-0000-0000-000000000007', 'dm-fin@t.iq'), ('d2000000-0000-0000-0000-000000000008', 'dm-it@t.iq'),
  ('d2000000-0000-0000-0000-000000000009', 'dm-hr@t.iq'), ('d2000000-0000-0000-0000-000000000004', 'dm-adm@t.iq'), ('d2000000-0000-0000-0000-00000000000a', 'dm-a@t.iq'), ('d2000000-0000-0000-0000-00000000000b', 'dm-b@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d2000000-0000-0000-0000-000000000001', 'ops_room'), ('d2000000-0000-0000-0000-000000000007', 'finance_officer'), ('d2000000-0000-0000-0000-000000000008', 'it_admin'),
  ('d2000000-0000-0000-0000-000000000009', 'hr_officer'), ('d2000000-0000-0000-0000-000000000004', 'super_admin'), ('d2000000-0000-0000-0000-00000000000a', 'employee'), ('d2000000-0000-0000-0000-00000000000b', 'employee')
on conflict do nothing;
select set_config('test.dm_m', (date_trunc('month', current_date) - interval '2 month')::date::text, false);
insert into public.departments (id, name, code, parent_id) values ('d2000000-0000-0000-0000-0000000000c1', 'dm قسم', 'DMQ', null) on conflict (id) do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin, department_id) values
  ('d2000000-0000-0000-0000-0000000000ea', 'd2000000-0000-0000-0000-00000000000a', 'dm موظف أ', 'DM-A', '2024-01-01', '8601', 'd2000000-0000-0000-0000-0000000000c1'),
  ('d2000000-0000-0000-0000-0000000000eb', 'd2000000-0000-0000-0000-00000000000b', 'dm موظف ب', 'DM-B', '2024-01-01', '8602', 'd2000000-0000-0000-0000-0000000000c1')
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('d2000000-0000-0000-0000-0000000000a1', 'dm شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('d2000000-0000-0000-0000-0000000000ea', 'd2000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('d2000000-0000-0000-0000-0000000000eb', 'd2000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('d2000000-0000-0000-0000-0000000000d1', 'DM-DEV-1', 'dm جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select auth.set_test_user('d2000000-0000-0000-0000-000000000007');
select public.finance_salary_set('d2000000-0000-0000-0000-0000000000ea', 'monthly', 600000, 0, '{}', '{}', null);
select public.finance_salary_set('d2000000-0000-0000-0000-0000000000eb', 'daily', 0, 20000, '{}', '{}', null);

-- ═══ S1 · الطرق الأربع: نفس النقص (40 د، شفت 480، سماحية 15) ═══
select auth.set_test_user('d2000000-0000-0000-0000-000000000008');
do $$ declare base jsonb := app.hr_deduction_defaults() || jsonb_build_object('deduction_tiers', '[{"from":1,"to":15,"minutes":0},{"from":16,"to":30,"minutes":30},{"from":31,"to":60,"minutes":60},{"from":61,"to":120,"minutes":120},{"from":121,"to":null,"day_fraction":0.5}]'::jsonb, 'grace_minutes_default', 15, 'absent_day_deduction_days', 1, 'auto_deduction_amount_mode', 'salary', 'max_auto_deduction_days_per_month', 0, 'auto_deduction_cap_ratio', 1, 'incomplete_punch_as_absent', false); r record; ok boolean; begin
  select * into r from app.hr_shortfall_for_rule(base || '{"shortfall_method":"tiers"}', 40, 480);
  assert r.o_minutes = 60 and r.o_days = 0 and r.o_method = 'tiers', 'S1 tiers 31-60 ⇒ 60: ' || row_to_json(r)::text;
  select * into r from app.hr_shortfall_for_rule(base || '{"shortfall_method":"actual"}', 40, 480);
  assert r.o_minutes = 40 and r.o_days = 0, 'S1 actual ⇒ 40: ' || row_to_json(r)::text;
  select * into r from app.hr_shortfall_for_rule(base || '{"shortfall_method":"multiplier","shortfall_multiplier":2}', 40, 480);
  assert r.o_minutes = 80 and r.o_days = 0, 'S1 ×2 ⇒ 80: ' || row_to_json(r)::text;
  select * into r from app.hr_shortfall_for_rule(base || '{"shortfall_method":"blocks","shortfall_block_minutes":30}', 40, 480);
  assert r.o_minutes = 60 and r.o_days = 0, 'S1 blocks30 ⇒ 60: ' || row_to_json(r)::text;
  select * into r from app.hr_shortfall_for_rule(base || '{"shortfall_method":"blocks","shortfall_block_minutes":30,"shortfall_multiplier":1.5}', 40, 480);
  assert r.o_minutes = 90, 'S1 blocks30 ×1.5 ⇒ 90: ' || row_to_json(r)::text;
  -- سقف اليوم الكامل
  select * into r from app.hr_shortfall_for_rule(base || '{"shortfall_method":"multiplier","shortfall_multiplier":3}', 200, 480);
  assert r.o_minutes = 0 and r.o_days = 1 and r.o_note like '%سقف اليوم الكامل%', 'S1 600 ≥ 480 ⇒ 1 day: ' || row_to_json(r)::text;
  select * into r from app.hr_shortfall_for_rule(base, 0, 480); assert r.o_minutes = 0 and r.o_days = 0, 'S1 zero';
  -- التحقق يرفض طريقة/مضاعف/كتلة خارج الحدود
  ok := false; begin perform public.it_deduction_rule_save(jsonb_build_object('name', 'x', 'settings', '{"shortfall_method":"weird"}'::jsonb)); exception when others then ok := sqlerrm like '%HR_RULE_INVALID%'; end; assert ok, 'S1 bad method';
  ok := false; begin perform public.it_deduction_rule_save(jsonb_build_object('name', 'x', 'settings', '{"shortfall_method":"multiplier","shortfall_multiplier":9}'::jsonb)); exception when others then ok := sqlerrm like '%HR_RULE_INVALID%'; end; assert ok, 'S1 bad multiplier';
  ok := false; begin perform public.it_deduction_rule_save(jsonb_build_object('name', 'x', 'settings', '{"shortfall_method":"blocks","shortfall_block_minutes":2}'::jsonb)); exception when others then ok := sqlerrm like '%HR_RULE_INVALID%'; end; assert ok, 'S1 bad block';
  assert (app.hr_deduction_defaults() ->> 'shortfall_method') = 'tiers' and (app.hr_deduction_defaults() ->> 'shortfall_multiplier')::numeric = 1, 'S1 defaults keep old behaviour';
  raise notice 'S1 ✅ الطرق الأربع + التحقق';
end $$;

-- ═══ S2 · قاعدة «دقيقة بدقيقة ×2، سماحية 5» على القسم ⇒ المحرّك يطبّقها على يوم ناقص 40 د ═══
do $$ declare m date := current_setting('test.dm_m')::date; rid uuid; n int; a record; begin
  rid := public.it_deduction_rule_save(jsonb_build_object('name', 'dm مضاعفة', 'settings', jsonb_build_object('shortfall_method', 'multiplier', 'shortfall_multiplier', 2, 'grace_minutes_default', 5)));
  perform set_config('test.dm_rule', rid::text, false);
  perform public.it_deduction_targets_set(rid, '[{"target_type":"department","target_id":"d2000000-0000-0000-0000-0000000000c1"}]'::jsonb);
  reset role; perform set_config('auth.user_id', '', false);
  n := public.biometric_ingest('DM-DEV-1', '8601' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8601' || E'\t' || (m + 1)::text || ' 15:20:00' || E'\t1', 'ATTLOG');
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 1;
  assert a.status = 'early_leave' and a.shortfall_minutes = 40 and a.proposed_deduction_minutes = 80 and a.proposed_deduction_days = 0 and a.deduction_reason like 'نقص 40 دقيقة%dm مضاعفة%', 'S2 ×2 ⇒ 80: ' || row_to_json(a)::text;
  raise notice 'S2 ✅ المحرّك يطبّق الطريقة الجديدة';
end $$;

-- ═══ S3 · الزمنية المدفوعة: خرج نصف اليوم بزمنية مدفوعة ⇒ «حاضر (زمنية)» بلا نقص ولا استقطاع ولا وقت إضافي ═══
select auth.set_test_user('d2000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.dm_m')::date; t uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_paid';
  update public.hr_policy set settings = settings || '{"permit_max_minutes": 300}'::jsonb where id = 1;
  perform public.hr_leave_request('d2000000-0000-0000-0000-0000000000ea', t, m + 2, m + 2, '12:00', '16:00', 'زمنية مدفوعة نصف يوم', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');   -- 240 د
  perform public.hr_leave_request('d2000000-0000-0000-0000-0000000000ea', t, m + 3, m + 3, '15:00', '16:00', 'زمنية مدفوعة ساعة لكنه داوم كاملاً', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
end $$;
select auth.set_test_user('d2000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.dm_m')::date; r record; a record; n int; begin
  for r in select id from public.hr_leaves where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  reset role; perform set_config('auth.user_id', '', false);
  n := public.biometric_ingest('DM-DEV-1',
    '8601' || E'\t' || (m + 2)::text || ' 08:00:00' || E'\t0\n' || '8601' || E'\t' || (m + 2)::text || ' 12:00:00' || E'\t1\n' ||
    '8601' || E'\t' || (m + 3)::text || ' 08:00:00' || E'\t0\n' || '8601' || E'\t' || (m + 3)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 2;
  assert a.status = 'time_permit' and a.early_minutes = 0 and a.worked_minutes = 240 and a.permit_minutes = 240 and a.shortfall_minutes = 0
     and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0 and a.deduction_reason is null and a.overtime_minutes = 0,
    'S3 نصف يوم بزمنية مدفوعة = زمنية بلا استقطاع: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 3;
  assert a.status = 'time_permit' and a.permit_minutes = 60 and a.worked_minutes = 480 and a.shortfall_minutes = 0 and a.overtime_minutes = 0 and a.proposed_deduction_minutes = 0,
    'S3 داوم كاملاً رغم الزمنية ⇒ لا تغطية ولا وقت إضافي: ' || row_to_json(a)::text;
  raise notice 'S3 ✅ الزمنية المدفوعة لا تُستقطع ولا تُنفخ وقتاً إضافياً';
end $$;

-- ═══ S4 · الزمنية غير المدفوعة: نفس نصف اليوم ⇒ الحالة «زمنية» لكن 240 د نقص تُستقطع (×2 ⇒ 480 ≥ شفت ⇒ يوم كامل) والسبب يذكرها ═══
select auth.set_test_user('d2000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.dm_m')::date; t uuid; begin
  select id into t from public.hr_leave_types where code = 'permit_unpaid';
  perform public.hr_leave_request('d2000000-0000-0000-0000-0000000000ea', t, m + 4, m + 4, '12:00', '16:00', 'زمنية غير مدفوعة', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
end $$;
select auth.set_test_user('d2000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.dm_m')::date; r record; a record; n int; begin
  for r in select id from public.hr_leaves where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  reset role; perform set_config('auth.user_id', '', false);
  n := public.biometric_ingest('DM-DEV-1', '8601' || E'\t' || (m + 4)::text || ' 08:00:00' || E'\t0\n' || '8601' || E'\t' || (m + 4)::text || ' 12:00:00' || E'\t1', 'ATTLOG');
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 4;
  assert a.status = 'time_permit' and a.permit_minutes = 0 and a.shortfall_minutes = 240 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 1
     and a.deduction_reason like '%زمنية غير مدفوعة 240 د%', 'S4 unpaid permit deducted: ' || row_to_json(a)::text;
  raise notice 'S4 ✅ الزمنية غير المدفوعة تُستقطع ويُذكر ذلك';
end $$;

-- ═══ S5 · إجازة مرضية (مدفوعة) + إجازة اعتيادية ⇒ إجازة بلا استقطاع حتى لو بصم نصف يوم؛ إجازة بدون راتب ⇒ يوم؛ الراتب: المدفوعة أيام مدفوعة ═══
select auth.set_test_user('d2000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.dm_m')::date; t uuid; begin
  select id into t from public.hr_leave_types where code = 'sick';
  perform public.hr_leave_request('d2000000-0000-0000-0000-0000000000ea', t, m + 5, m + 5, null, null, 'مرضية', 'https://x/sick.pdf', 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  select id into t from public.hr_leave_types where code = 'annual';
  perform public.hr_leave_request('d2000000-0000-0000-0000-0000000000ea', t, m + 6, m + 6, null, null, 'اعتيادية', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform public.hr_leave_request('d2000000-0000-0000-0000-0000000000ea', t, m + 7, m + 7, null, null, 'بدون راتب', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
end $$;
select auth.set_test_user('d2000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.dm_m')::date; r record; a record; n int; begin
  for r in select id from public.hr_leaves where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  reset role; perform set_config('auth.user_id', '', false);
  -- بصم نصف يوم أثناء المرضية (جاء ثم غادر)
  n := public.biometric_ingest('DM-DEV-1', '8601' || E'\t' || (m + 5)::text || ' 08:00:00' || E'\t0\n' || '8601' || E'\t' || (m + 5)::text || ' 12:00:00' || E'\t1', 'ATTLOG');
  perform app.hr_evaluate_month(m);
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 5;
  assert a.status = 'leave' and a.shortfall_minutes = 0 and a.proposed_deduction_minutes = 0 and a.proposed_deduction_days = 0 and a.deduction_reason is null, 'S5 sick + half-day punches ⇒ leave, no deduction: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 6;
  assert a.status = 'leave' and a.proposed_deduction_days = 0 and a.deduction_reason is null, 'S5 annual ⇒ no deduction: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = 'd2000000-0000-0000-0000-0000000000ea' and work_date = m + 7;
  assert a.status = 'leave' and a.proposed_deduction_days = 1 and a.deduction_reason like 'إجازة بدون راتب%', 'S5 unpaid leave ⇒ 1 day: ' || row_to_json(a)::text;
end $$;
-- كشف المالية: أيام الإجازة المدفوعة تُحتسب مدفوعة؛ الاستقطاع التلقائي = نقص S2 (80 د) + زمنية غير مدفوعة S4 (يوم) + إجازة بدون راتب S5 (يوم)
select auth.set_test_user('d2000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.dm_m')::date; r record; begin
  select * into r from app.hr_month_summary(m) s where s.employee_id = 'd2000000-0000-0000-0000-0000000000ea';
  assert r.days_leave_paid = 2 and r.days_leave_unpaid = 1 and r.days_leave = 3, 'S5 month summary paid/unpaid leave days: ' || row_to_json(r)::text;
  assert r.auto_minutes = 80 and r.auto_days_shortfall = 1 and r.auto_days_absence = r.days_absent + 1 and r.auto_days = r.days_absent + 2, 'S5 month summary auto minutes/days: ' || row_to_json(r)::text;
  assert r.days_present = 4 and r.days_late = 0, 'S5 present days (S2 early_leave + S3 two permit days + S4 permit day) — none counted late/absent: ' || row_to_json(r)::text;
  raise notice 'S5 ✅ الإجازات المدفوعة لا تُستقطع وتُحتسب مدفوعة؛ غير المدفوعة تُستقطع';
end $$;

-- ═══ S6 · المحاكاة التفصيلية: خطوات + سلّم؛ الزمنية المدفوعة تغطي؛ غير المدفوعة لا تغطي؛ نوع التعاقد اليومي ═══
select auth.set_test_user('d2000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; s jsonb := app.hr_deduction_defaults() || jsonb_build_object('deduction_tiers', '[{"from":1,"to":15,"minutes":0},{"from":16,"to":30,"minutes":30},{"from":31,"to":60,"minutes":60},{"from":61,"to":120,"minutes":120},{"from":121,"to":null,"day_fraction":0.5}]'::jsonb, 'grace_minutes_default', 15, 'absent_day_deduction_days', 1, 'auto_deduction_amount_mode', 'salary', 'max_auto_deduction_days_per_month', 0, 'auto_deduction_cap_ratio', 1, 'incomplete_punch_as_absent', false); begin
  -- تأخر 20 + خروج مبكر 40 = 60، زمنية مدفوعة 60 ⇒ لا نقص ⇒ حاضر (زمنية)، لا استقطاع
  j := public.it_deduction_simulate_v2(s, '{"shift_minutes":480,"base_salary":600000,"late_minutes":20,"early_minutes":40,"paid_permit_minutes":60}');
  assert j ->> 'status' = 'time_permit' and (j ->> 'shortfall_minutes')::int = 0 and (j ->> 'amount')::numeric = 0 and (j ->> 'covered_minutes')::int = 60, 'S6 paid permit covers: ' || j::text;
  assert jsonb_array_length(j -> 'steps') = 5 and jsonb_array_length(j -> 'ladder') = 11, 'S6 steps/ladder: ' || j::text;
  assert (select x ->> 'text' from jsonb_array_elements(j -> 'steps') x where x ->> 'key' = 'method') like '%حاضر (زمنية)%', 'S6 explain text';
  -- نفس الحالة بزمنية غير مدفوعة ⇒ نقص 60 ⇒ شريحة 31-60 ⇒ 60 د ⇒ 60 × (20000/480)=2500
  j := public.it_deduction_simulate_v2(s, '{"shift_minutes":480,"base_salary":600000,"late_minutes":20,"early_minutes":40,"unpaid_permit_minutes":60}');
  assert j ->> 'status' = 'late' and (j ->> 'shortfall_minutes')::int = 60 and (j ->> 'minutes')::int = 60 and (j ->> 'amount')::numeric = 2500, 'S6 unpaid permit: ' || j::text;
  assert (select x ->> 'text' from jsonb_array_elements(j -> 'steps') x where x ->> 'key' = 'shortfall') like '%غير المدفوعة 60 د لا تغطي%', 'S6 unpaid explain';
  -- غياب 1 + إجازة غير مدفوعة 2 + إجازة مدفوعة 3 ⇒ أيام 3 ⇒ 60000؛ المدفوعة بلا أثر
  j := public.it_deduction_simulate_v2(s, '{"shift_minutes":480,"base_salary":600000,"absent_days":1,"unpaid_leave_days":2,"paid_leave_days":3}');
  assert (j ->> 'days')::numeric = 3 and (j ->> 'amount')::numeric = 60000 and (j ->> 'paid_leave_days')::int = 3 and (j ->> 'amount_unpaid_leave')::numeric = 40000, 'S6 days: ' || j::text;
  -- السلّم: 10 ضمن السماحية؛ 20 ⇒ 30 د = 1250؛ 240 ⇒ 0.5 يوم = 10000
  assert (select (x ->> 'within_grace')::boolean from jsonb_array_elements(j -> 'ladder') x where (x ->> 'shortfall')::int = 10), 'S6 ladder grace';
  assert (select (x ->> 'amount')::numeric from jsonb_array_elements(j -> 'ladder') x where (x ->> 'shortfall')::int = 20) = 1250, 'S6 ladder 20';
  assert (select (x ->> 'amount')::numeric from jsonb_array_elements(j -> 'ladder') x where (x ->> 'shortfall')::int = 240) = 10000, 'S6 ladder 240';
  -- تعاقد يومي: أجر اليوم = الأجر نفسه؛ طريقة دقيقة بدقيقة؛ نقص 40 ⇒ 40 × (20000/480) = 1666.67
  j := public.it_deduction_simulate_v2(s || '{"shortfall_method":"actual"}', '{"shift_minutes":480,"base_salary":20000,"pay_type":"daily","early_minutes":40}');
  assert (j ->> 'day_rate')::numeric = 20000 and (j ->> 'minutes')::int = 40 and (j ->> 'amount')::numeric = 1666.67 and j ->> 'method' = 'actual', 'S6 daily actual: ' || j::text;
  -- سقف أيام الشهر: 3 أيام غياب بسقف 2 ⇒ 40000 ومُعلَّم capped
  j := public.it_deduction_simulate_v2(s || '{"max_auto_deduction_days_per_month":2}', '{"shift_minutes":480,"base_salary":600000,"absent_days":3}');
  assert (j ->> 'amount')::numeric = 40000 and (j ->> 'capped')::boolean, 'S6 cap: ' || j::text;
  -- متوقف ⇒ صفر
  j := public.it_deduction_simulate_v2(s || '{"auto_deduction_enabled":false}', '{"early_minutes":100,"absent_days":2,"base_salary":600000}');
  assert not (j ->> 'enabled')::boolean and (j ->> 'amount')::numeric = 0 and (j ->> 'days')::numeric = 0, 'S6 off: ' || j::text;
  -- المحاكاة القديمة تعمل بالطريقة الجديدة أيضاً
  j := public.it_deduction_simulate(s || '{"shortfall_method":"blocks","shortfall_block_minutes":60}', 40, 480, 600000, 0, 0);
  assert (j ->> 'minutes')::int = 60 and j ->> 'method' = 'blocks', 'S6 v1 blocks: ' || j::text;
  raise notice 'S6 ✅ المحاكاة التفصيلية';
end $$;

-- ═══ S7 · غير المصرَّح لا يحاكي ═══
select auth.set_test_user('d2000000-0000-0000-0000-00000000000a');
do $$ declare ok boolean := false; begin
  begin perform public.it_deduction_simulate_v2('{}', '{}'); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end;
  assert ok, 'S7 forbidden';
  raise notice 'S7 ✅ الصلاحيات';
end $$;
