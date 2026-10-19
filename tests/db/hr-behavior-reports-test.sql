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
