-- 00249 · تقارير سلوك الموظفين (بادئة bh): الفترات، المقاييس، الدرجة، الاستبعاد، الصلاحيات، بطاقة الموظف
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('d9000000-0000-0000-0000-000000000009', 'bh-hr@t.iq'), ('d9000000-0000-0000-0000-000000000001', 'bh-ops@t.iq'), ('d9000000-0000-0000-0000-000000000002', 'bh-exec@t.iq'), ('d9000000-0000-0000-0000-000000000003', 'bh-dep@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('d9000000-0000-0000-0000-000000000009', 'hr_officer'), ('d9000000-0000-0000-0000-000000000001', 'ops_room'), ('d9000000-0000-0000-0000-000000000002', 'executive_director'), ('d9000000-0000-0000-0000-000000000003', 'deputy_director') on conflict do nothing;
insert into public.departments (id, name, code) values ('d9000000-0000-0000-0000-0000000000d1', 'bh قسم أ', 'BHA'), ('d9000000-0000-0000-0000-0000000000d2', 'bh قسم ب', 'BHB') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin, department_id) values
  ('d9000000-0000-0000-0000-0000000000e1', 'bh مثالي', 'BH-A', '2024-01-01', '9901', 'd9000000-0000-0000-0000-0000000000d1'),
  ('d9000000-0000-0000-0000-0000000000e2', 'bh متأخر مزمن', 'BH-B', '2024-01-01', '9902', 'd9000000-0000-0000-0000-0000000000d1'),
  ('d9000000-0000-0000-0000-0000000000e3', 'bh كثير الغياب', 'BH-C', '2024-01-01', '9903', 'd9000000-0000-0000-0000-0000000000d2'),
  ('d9000000-0000-0000-0000-0000000000e4', 'bh بلا بصمة', 'BH-D', '2024-01-01', null, 'd9000000-0000-0000-0000-0000000000d2'),
  ('d9000000-0000-0000-0000-0000000000e5', 'bh رقم بلا بصمات', 'BH-E', '2024-01-01', '9905', 'd9000000-0000-0000-0000-0000000000d2') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('d9000000-0000-0000-0000-0000000000a1', 'bh شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select e, 'd9000000-0000-0000-0000-0000000000a1', '2024-01-01' from unnest(array['d9000000-0000-0000-0000-0000000000e1','d9000000-0000-0000-0000-0000000000e2','d9000000-0000-0000-0000-0000000000e3','d9000000-0000-0000-0000-0000000000e4','d9000000-0000-0000-0000-0000000000e5']::uuid[]) e on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('d9000000-0000-0000-0000-0000000000d9', 'BH-DEV-1', 'bh جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.bh_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
select set_config('test.bh_p', (date_trunc('month', current_date) - interval '2 month')::date::text, false);

-- ═══ T1 · حدود الفترات ═══
do $$ declare p record; begin
  select * into p from app.hr_behavior_period('quarterly', '2026-05-17');
  assert p.period_from = '2026-04-01' and p.period_to = '2026-06-30' and p.prev_from = '2026-01-01' and p.prev_to = '2026-03-31' and p.label = 'Q2 2026', 'T1 quarterly: ' || row_to_json(p)::text;
  select * into p from app.hr_behavior_period('half_yearly', '2026-09-01');
  assert p.period_from = '2026-07-01' and p.period_to = '2026-12-31' and p.prev_from = '2026-01-01' and p.label = 'H2 2026', 'T1 half: ' || row_to_json(p)::text;
  select * into p from app.hr_behavior_period('yearly', '2025-03-03');
  assert p.period_from = '2025-01-01' and p.period_to = '2025-12-31' and p.prev_from = '2024-01-01' and p.label = '2025', 'T1 yearly';
  select * into p from app.hr_behavior_period('monthly', '2026-02-10');
  assert p.period_from = '2026-02-01' and p.period_to = '2026-02-28' and p.prev_from = '2026-01-01' and p.prev_to = '2026-01-31', 'T1 monthly';
  assert app.hr_behavior_grade(95) = 'excellent' and app.hr_behavior_grade(80) = 'very_good' and app.hr_behavior_grade(70) = 'good' and app.hr_behavior_grade(60) = 'fair' and app.hr_behavior_grade(59.9) = 'poor', 'T1 grades';
  raise notice 'T1 ✅ الفترات والتصنيف';
end $$;

-- بصمات الشهر الماضي (الفترة) والشهر قبله (السابقة): A كامل 8–16 · B متأخر 30 د في 60% من الأيام (ومثالي الشهر السابق) · C غائب 4 أيام وباقي الأيام كامل · E لا بصمات
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.bh_m')::date; p date := current_setting('test.bh_p')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; dimp int := extract(day from (p + interval '1 month - 1 day'))::int; i int; n int; begin
  for i in 0..dim - 1 loop
    n := public.biometric_ingest('BH-DEV-1', '9901' || E'\t' || (m + i)::text || E' 08:00:00\t0\n9901\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG');
    n := public.biometric_ingest('BH-DEV-1', '9902' || E'\t' || (m + i)::text || ' ' || case when i % 5 < 3 then '08:30:00' else '08:00:00' end || E'\t0\n9902\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG');
    if i >= 4 then n := public.biometric_ingest('BH-DEV-1', '9903' || E'\t' || (m + i)::text || E' 08:00:00\t0\n9903\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG'); end if;
  end loop;
  for i in 0..dimp - 1 loop
    n := public.biometric_ingest('BH-DEV-1', '9902' || E'\t' || (p + i)::text || E' 08:00:00\t0\n9902\t' || (p + i)::text || E' 16:00:00\t1', 'ATTLOG');
  end loop;
  perform app.hr_evaluate_month(p); perform app.hr_evaluate_month(m);
end $$;

-- ═══ T2 · الصلاحيات: HR والمدير المفوض ومعاونه يقرؤون؛ غرفة العمليات لا ═══
select auth.set_test_user('d9000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.hr_behavior_report('monthly', current_setting('test.bh_m')::date); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end; assert ok, 'T2 ops forbidden';
end $$;
select auth.set_test_user('d9000000-0000-0000-0000-000000000002');
do $$ begin assert public.hr_behavior_report('monthly', current_setting('test.bh_m')::date) is not null, 'T2 exec reads'; end $$;
select auth.set_test_user('d9000000-0000-0000-0000-000000000003');
do $$ begin assert public.hr_behavior_report('monthly', current_setting('test.bh_m')::date) is not null, 'T2 deputy reads'; raise notice 'T2 ✅ الصلاحيات'; end $$;

-- ═══ T3 · التقرير الشهري: الاستبعاد، الدرجات، الترتيب، المقارنة، الأقسام، الاتجاه ═══
select auth.set_test_user('d9000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.bh_m')::date; r jsonb; a jsonb; b jsonb; c jsonb; ids text[]; dim int := extract(day from (m + interval '1 month - 1 day'))::int; late_b int; begin
  r := public.hr_behavior_report('monthly', m, 'd9000000-0000-0000-0000-0000000000d1'); -- قسم أ فقط
  select array_agg(x ->> 'employee_number') into ids from jsonb_array_elements(r -> 'employees') x;
  assert ids = array['BH-A', 'BH-B'], 'T3 department filter: ' || ids::text;
  r := public.hr_behavior_report('monthly', m);
  select array_agg(x ->> 'employee_number' order by x ->> 'employee_number') into ids from jsonb_array_elements(r -> 'employees') x where (x ->> 'employee_number') like 'BH-%';
  assert ids = array['BH-A', 'BH-B', 'BH-C'], 'T3 بلا بصمة/بلا بصمات مستبعدون: ' || ids::text;
  select x into a from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-A';
  select x into b from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-B';
  select x into c from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-C';
  assert (a ->> 'score')::numeric = 100 and a ->> 'grade' = 'excellent' and (a ->> 'rank')::int = 1 and (a ->> 'perfect_days')::int = dim and (a ->> 'max_perfect_streak')::int = dim, 'T3 A: ' || a::text;
  assert a -> 'prev_score' = 'null'::jsonb and a -> 'delta' = 'null'::jsonb, 'T3 A لا فترة سابقة';
  late_b := (b ->> 'late_days')::int;
  assert late_b = (select count(*) from generate_series(0, dim - 1) i where i % 5 < 3) and (b ->> 'late_minutes')::int = late_b * 20, 'T3 B late (فوق السماحية 10): ' || b::text;
  assert (b ->> 'chronic_late')::boolean and (b ->> 'score')::numeric = 69.9 and b ->> 'grade' = 'fair', 'T3 B chronic ⇒ بوابة 69.9: ' || (b ->> 'score');
  assert (b ->> 'prev_score')::numeric = 100 and (b ->> 'delta')::numeric = (b ->> 'score')::numeric - 100 and b ->> 'prev_grade' = 'excellent', 'T3 B prev: ' || b::text;
  assert (c ->> 'absent_days')::int = 4 and (c ->> 'high_absence')::boolean and (c ->> 'late_days')::int = 0 and (c ->> 'expected_days')::int = dim and (c ->> 'present_days')::int = dim - 4, 'T3 C: ' || c::text;
  assert (c -> 'indices' ->> 'attendance')::numeric = round(1 - 2 * 4::numeric / dim, 4) and (c ->> 'score')::numeric = 69.9 and c ->> 'grade' = 'fair', 'T3 C غياب مرتفع ⇒ بوابة: ' || c::text;
  assert (a ->> 'rank')::int < (b ->> 'rank')::int, 'T3 ranking';
  -- الملخص
  assert (r -> 'summary' ->> 'employees')::int >= 3 and (r -> 'summary' -> 'grades' ->> 'excellent')::int >= 1 and (r -> 'summary' -> 'grades' ->> 'fair')::int >= 2 and (r -> 'summary' ->> 'chronic_late')::int >= 1 and (r -> 'summary' ->> 'declined')::int >= 1, 'T3 summary: ' || (r -> 'summary')::text;
  assert (r -> 'weights' ->> 'attendance')::int = 40 and (r -> 'weights' ->> 'consistency')::int = 10, 'T3 weights';
  -- الاتجاه: أسابيع للشهري (≥4)؛ أيام الأسبوع 7
  assert jsonb_array_length(r -> 'trend') between 4 and 6 and (r -> 'trend' -> 0 ? 'avg_score'), 'T3 trend: ' || (r -> 'trend')::text;
  assert jsonb_array_length(r -> 'weekdays') = 7, 'T3 weekdays';
  -- الأقسام: قسم أ (A,B) وقسم ب (C)
  assert exists (select 1 from jsonb_array_elements(r -> 'departments') x where x ->> 'name' = 'bh قسم أ' and (x ->> 'employees')::int = 2), 'T3 departments: ' || (r -> 'departments')::text;
  assert r -> 'period' ->> 'kind' = 'monthly' and (r -> 'period' ->> 'period_from')::date = m, 'T3 period';
  raise notice 'T3 ✅ التقرير الشهري (B score %, C score %)', b ->> 'score', c ->> 'score';
end $$;

-- ═══ T4 · ربع سنوي يشمل الفترتين: B له بصمات في الشهرين؛ الاتجاه بالأشهر؛ الفترة المستقبلية فارغة ═══
do $$ declare m date := current_setting('test.bh_m')::date; r jsonb; b jsonb; begin
  r := public.hr_behavior_report('quarterly', m);
  select x into b from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-B';
  assert b is not null and (b ->> 'worked_days')::int > 31, 'T4 B across months: ' || coalesce(b::text, 'null');
  assert (r -> 'trend' -> 0 ->> 'label') ~ '^\d{4}-\d{2}$', 'T4 monthly buckets: ' || (r -> 'trend')::text;
  r := public.hr_behavior_report('yearly', (current_date + interval '2 year')::date);
  assert jsonb_array_length(r -> 'employees') = 0 and r -> 'summary' = 'null'::jsonb, 'T4 future empty';
  raise notice 'T4 ✅ ربع سنوي ومستقبل';
end $$;

-- ═══ T5 · بطاقة الموظف: السجل اليومي، أيام الأسبوع، التوزيع، الرتبة، المقارنة ═══
do $$ declare m date := current_setting('test.bh_m')::date; r jsonb; dim int := extract(day from (m + interval '1 month - 1 day'))::int; begin
  r := public.hr_behavior_employee('d9000000-0000-0000-0000-0000000000e2', 'monthly', m);
  assert r -> 'employee' ->> 'full_name' = 'bh متأخر مزمن' and (r -> 'current' ->> 'late_days')::int > 0 and (r -> 'previous' ->> 'score')::numeric = 100, 'T5 head: ' || (r -> 'current')::text;
  assert jsonb_array_length(r -> 'days') = dim and (r -> 'days' -> 0 ->> 'in_offset')::int = 30 and (r -> 'days' -> 3 ->> 'in_offset')::int = 0, 'T5 days: ' || (r -> 'days' -> 0)::text;
  assert jsonb_array_length(r -> 'weekdays') = 7 and jsonb_array_length(r -> 'in_histogram') = 2, 'T5 weekdays/hist: ' || (r -> 'in_histogram')::text;
  assert (r ->> 'rank')::int >= 2 and (r ->> 'population')::int >= 3 and jsonb_array_length(r -> 'trend') >= 4, 'T5 rank/trend';
  raise notice 'T5 ✅ بطاقة الموظف';
end $$;
select auth.set_test_user('d9000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.hr_behavior_employee('d9000000-0000-0000-0000-0000000000e2', 'monthly', current_setting('test.bh_m')::date); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end; assert ok, 'T5 ops forbidden on employee card';
end $$;

-- ═══ T6 (00250) · سلسلة الفترات: شهران من البيانات ⇒ B متراجع (100 ← 69.9)، A بفترة واحدة، الأعمدة بطول الفترات ═══
select auth.set_test_user('d9000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.bh_m')::date; r jsonb; b jsonb; a jsonb; n int; begin
  r := public.hr_behavior_series('monthly', m, 3);
  n := jsonb_array_length(r -> 'periods');
  assert n = 3 and (r -> 'periods' -> 2 ->> 'label') = to_char(m, 'YYYY-MM') and (r -> 'periods' -> 2 ->> 'avg_score') is not null, 'T6 periods: ' || (r -> 'periods')::text;
  select x into b from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-B';
  assert jsonb_array_length(b -> 'scores') = 3 and (b -> 'scores' -> 0) = 'null'::jsonb and (b -> 'scores' -> 1)::text = '100.0' and (b -> 'scores' -> 2)::text = '69.9', 'T6 B scores: ' || b::text;
  assert b ->> 'trend' = 'declining' and (b ->> 'slope')::numeric < 0 and (b ->> 'last_score')::numeric = 69.9 and (b ->> 'first_score')::numeric = 100 and (b ->> 'periods_with_data')::int = 2, 'T6 B trend: ' || b::text;
  select x into a from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-A';
  assert a ->> 'trend' = 'insufficient' and (a -> 'scores' -> 2)::text = '100.0' and (a -> 'scores' -> 1) = 'null'::jsonb, 'T6 A: ' || a::text;
  r := public.hr_behavior_series('monthly', m, 2, 'd9000000-0000-0000-0000-0000000000d2');
  assert not exists (select 1 from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-A'), 'T6 dept filter';
  raise notice 'T6 ✅ سلسلة الفترات';
end $$;
select auth.set_test_user('d9000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.hr_behavior_series('monthly', current_setting('test.bh_m')::date, 3); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end; assert ok, 'T6 ops forbidden on series';
end $$;

-- ═══ 00304 (00359) · تدقيق الدقة ═══
-- T7 · الخروج المبكر داخل فترة السماح (10 د) لا يُعدّ يوم خروج مبكر؛ وما تجاوزها يُعدّ — ومجموع الدقائق من الأيام المعدودة فقط
select auth.set_test_user('d9000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.bh_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; r jsonb; a jsonb; n int; begin
  reset role; perform set_config('auth.user_id', '', true);
  -- A: اليوم 1 خروج 15:55 (داخل السماح) · اليوم 2 خروج 15:30 (30 د مبكر)
  update public.hr_attendance_days set check_out = ((m + 0) + time '15:55')::timestamp - app.hr_tz(), early_minutes = 5, status = 'present' where employee_id = 'd9000000-0000-0000-0000-0000000000e1' and work_date = m + 0;
  update public.hr_attendance_days set check_out = ((m + 1) + time '15:30')::timestamp - app.hr_tz(), early_minutes = 30, status = 'early_leave' where employee_id = 'd9000000-0000-0000-0000-0000000000e1' and work_date = m + 1;
  perform auth.set_test_user('d9000000-0000-0000-0000-000000000009');
  r := public.hr_behavior_report('monthly', m);
  select x into a from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-A';
  assert (a ->> 'early_days')::int = 1 and (a ->> 'early_minutes')::int = 30, 'T7 early within grace ignored: ' || a::text;
  assert (a ->> 'perfect_days')::int = dim - 1, 'T7 perfect days: ' || (a ->> 'perfect_days');
  -- أيام الأسبوع تتطابق مع مجاميع الموظفين
  select sum((w ->> 'early_days')::int) into n from jsonb_array_elements(r -> 'weekdays') w;
  assert n = (select sum((e ->> 'early_days')::int) from jsonb_array_elements(r -> 'employees') e), 'T7 weekdays == employees early: ' || n;
  select sum((w ->> 'late_days')::int) into n from jsonb_array_elements(r -> 'weekdays') w;
  assert n = (select sum((e ->> 'late_days')::int) from jsonb_array_elements(r -> 'employees') e), 'T7 weekdays == employees late: ' || n;
  -- بطاقة الموظف: اليوم الأول غير معلَّم خروجاً مبكراً والثاني معلَّم، وفترة السماح ظاهرة
  r := public.hr_behavior_employee('d9000000-0000-0000-0000-0000000000e1', 'monthly', m);
  assert (r -> 'days' -> 0 ->> 'is_early')::boolean = false and (r -> 'days' -> 1 ->> 'is_early')::boolean = true and (r -> 'days' -> 0 ->> 'grace')::int = 10, 'T7 card flags: ' || (r -> 'days' -> 0)::text;
  raise notice 'T7 ✅ الخروج المبكر وفترة السماح';
end $$;

-- T8 · مدة الخدمة: صف يدوي بعد آخر يوم عمل (أو قبل التعيين) لا يدخل في الحساب — كما في كشف الحضور
do $$ declare m date := current_setting('test.bh_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; r jsonb; c jsonb; before_abs int; begin
  perform auth.set_test_user('d9000000-0000-0000-0000-000000000009');
  r := public.hr_behavior_report('monthly', m);
  select x into c from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-C';
  before_abs := (c ->> 'absent_days')::int; assert before_abs = 4, 'T8 baseline: ' || before_abs;
  reset role; perform set_config('auth.user_id', '', true);
  -- C أُنهيت خدمته في اليوم 20: يوم يدوي «غائب» في اليوم 25 يجب ألا يُحتسب
  update public.employees set employment_status = 'terminated', terminated_at = m + 19 where id = 'd9000000-0000-0000-0000-0000000000e3';
  update public.hr_attendance_days set source = 'manual', status = 'absent', check_in = null, check_out = null, late_minutes = 0, early_minutes = 0 where employee_id = 'd9000000-0000-0000-0000-0000000000e3' and work_date = m + 24;
  perform auth.set_test_user('d9000000-0000-0000-0000-000000000009');
  r := public.hr_behavior_report('monthly', m);
  select x into c from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-C';
  assert (c ->> 'absent_days')::int = 4 and (c ->> 'scheduled_days')::int = 20, 'T8 after last day excluded: ' || c::text;
  r := public.hr_behavior_employee('d9000000-0000-0000-0000-0000000000e3', 'monthly', m);
  assert jsonb_array_length(r -> 'days') = 20, 'T8 card days: ' || jsonb_array_length(r -> 'days');
  -- قبل التعيين: تعيين B في اليوم 3 ⇒ أول يومين لا يدخلان
  reset role; perform set_config('auth.user_id', '', true);
  update public.employees set hire_date = m + 2 where id = 'd9000000-0000-0000-0000-0000000000e2';
  perform auth.set_test_user('d9000000-0000-0000-0000-000000000009');
  r := public.hr_behavior_report('monthly', m);
  select x into c from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-B';
  assert (c ->> 'scheduled_days')::int = dim - 2, 'T8 before hire excluded: ' || c::text;
  reset role; perform set_config('auth.user_id', '', true);
  update public.employees set hire_date = '2024-01-01' where id = 'd9000000-0000-0000-0000-0000000000e2';
  update public.employees set employment_status = 'active', terminated_at = null where id = 'd9000000-0000-0000-0000-0000000000e3';
  raise notice 'T8 ✅ مدة الخدمة';
end $$;

-- T9 · الاستقرار: الحضور قبل الموعد لا يُنقص المؤشر (A يبصم 7:30 و8:00 بالتناوب ⇒ استقرار = 1)
do $$ declare m date := current_setting('test.bh_m')::date; r jsonb; a jsonb; i int; begin
  reset role; perform set_config('auth.user_id', '', true);
  update public.hr_attendance_days set check_in = check_in - interval '30 minutes' where employee_id = 'd9000000-0000-0000-0000-0000000000e1' and work_date between m and m + 27 and extract(day from work_date)::int % 2 = 0;
  perform auth.set_test_user('d9000000-0000-0000-0000-000000000009');
  r := public.hr_behavior_report('monthly', m);
  select x into a from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-A';
  assert (a ->> 'sd_in_offset')::numeric = 0 and (a -> 'indices' ->> 'consistency')::numeric = 1 and (a ->> 'avg_in_offset')::numeric < 0, 'T9 early arrivals neutral: ' || a::text;
  -- B متأخر 30 د في 60% من الأيام ⇒ تذبذب حقيقي ⇒ المؤشر أقل من 1
  select x into a from jsonb_array_elements(r -> 'employees') x where x ->> 'employee_number' = 'BH-B';
  assert (a -> 'indices' ->> 'consistency')::numeric < 1 and (a ->> 'sd_in_offset')::numeric > 10, 'T9 real jitter counted: ' || a::text;
  raise notice 'T9 ✅ الاستقرار';
end $$;

-- T10 · صيغة واحدة لنسبة الالتزام بالحضور في التقرير والسلسلة
do $$ declare m date := current_setting('test.bh_m')::date; r jsonb; s jsonb; begin
  perform auth.set_test_user('d9000000-0000-0000-0000-000000000009');
  r := public.hr_behavior_report('monthly', m); s := public.hr_behavior_series('monthly', m, 2);
  assert (r -> 'summary' ->> 'attendance_rate')::numeric = (s -> 'periods' -> 1 ->> 'attendance_rate')::numeric, 'T10 same formula: ' || (r -> 'summary' ->> 'attendance_rate') || ' vs ' || (s -> 'periods' -> 1 ->> 'attendance_rate');
  assert (r -> 'summary' ->> 'attendance_rate')::numeric = round(100 * (select sum((e ->> 'present_days')::int)::numeric / sum((e ->> 'expected_days')::int) from jsonb_array_elements(r -> 'employees') e), 1), 'T10 present/expected';
  raise notice 'T10 ✅ صيغة الحضور';
end $$;
reset role; select set_config('auth.user_id','', false);
