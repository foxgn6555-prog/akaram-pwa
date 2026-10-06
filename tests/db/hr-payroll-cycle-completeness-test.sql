-- 00186 · دورة الرواتب: سيناريو المستخدم (راتب 100,000 · 3 أيام حضور · صافٍ 90,000) يجب ألا يتكرر (بادئة pc)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('fd000000-0000-0000-0000-00000000000b', 'pc-ops@t.iq'), ('fd000000-0000-0000-0000-00000000000c', 'pc-fin@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('fd000000-0000-0000-0000-00000000000b', 'ops_room'), ('fd000000-0000-0000-0000-00000000000c', 'finance_officer') on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('fd000000-0000-0000-0000-0000000000d1', 'pc صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
  ('fd000000-0000-0000-0000-0000000000e1', 'PC-1', 'كرار يوسف', '2024-01-01', '7501') on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('fd000000-0000-0000-0000-0000000000e1', 'fd000000-0000-0000-0000-0000000000d1', '2024-01-01') on conflict do nothing;
create or replace function pg_temp.pc_punch(p_day date, p_time time) returns void language sql as $$
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method)
  values ('PC', '7501', 'fd000000-0000-0000-0000-0000000000e1', (p_day + p_time)::timestamp - interval '3 hours', 'manual')
$$;
select auth.set_test_user('fd000000-0000-0000-0000-00000000000c');
select public.finance_salary_set('fd000000-0000-0000-0000-0000000000e1', 'monthly', 100000, 0, '{}', '{}', null);

-- الشهر الماضي: 3 أيام حضور متأخر جداً (الدخول 15:30 — أي نقص ~7.5 ساعة) + يومان ببصمة واحدة فقط (ناقص) + باقي الشهر بلا أي بصمة ولا احتساب
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; begin
  perform pg_temp.pc_punch(m + 1, '15:30'); perform pg_temp.pc_punch(m + 1, '16:05');
  perform pg_temp.pc_punch(m + 2, '15:30'); perform pg_temp.pc_punch(m + 2, '16:05');
  perform pg_temp.pc_punch(m + 3, '15:30'); perform pg_temp.pc_punch(m + 3, '16:05');
  perform pg_temp.pc_punch(m + 4, '08:00');
  perform pg_temp.pc_punch(m + 5, '08:00');
end $$;

-- ═══ S1 · قبل التصدير: الملخص الخام يُظهر 5 أيام فقط (كما في شاشة المستخدم) لكن التغطية تكشف الأيام غير المحتسبة ═══
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; s record; c record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  select * into s from app.hr_month_summary(m) where employee_id = 'fd000000-0000-0000-0000-0000000000e1';
  -- (محفّز البصمة قد يحتسب يوماً مجاوراً أيضاً؛ المهم أن أغلب الشهر غير محتسب)
  assert s.working_days between 5 and 7 and s.days_present = 3 and s.days_incomplete = 2 and s.auto_days_shortfall = 3, 'S1 raw summary: ' || row_to_json(s)::text;
  assert s.scheduled_days = dim and s.unevaluated_days = dim - s.working_days and s.unevaluated_days >= 20, 'S1 coverage: ' || row_to_json(s)::text;
  raise notice 'S1 ✅ الأيام غير المحتسبة مكشوفة: % من %', s.unevaluated_days, dim;
end $$;
select auth.set_test_user('fd000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; st jsonb; begin
  st := public.hr_month_export_status(m);
  assert (st ->> 'unevaluated_days')::int > 20 and (st ->> 'unevaluated_employees')::int >= 1, 'S1 status: ' || st::text;
end $$;

-- ═══ S2 · التصدير يحتسب الشهر كاملاً أولاً: الغياب يظهر، الصافي ينخفض فعلاً، ولا أيام غير محتسبة في الكشف ═══
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; dim int; expected numeric; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PC-1';
  assert r.unevaluated_days = 0 and r.scheduled_days = dim and r.working_days = dim, 'S2 complete: ' || row_to_json(r)::text;
  assert r.days_present = 3 and r.days_incomplete = 2 and r.days_absent = dim - 5, 'S2 counts: ' || row_to_json(r)::text;
  -- الاستقطاع التلقائي = 3 أيام (شرائح النقص لأيام الحضور) + (dim-5) يوم غياب؛ أجر اليوم = 100000/30
  assert r.auto_deduction_days = 3 + (dim - 5) and r.auto_absence_days = dim - 5 and r.auto_shortfall_days = 3, 'S2 auto split: ' || row_to_json(r)::text;
  expected := greatest(0, 100000 - round(round(100000::numeric / 30, 4) * (3 + dim - 5), 2));
  assert r.proposed_net = expected and r.proposed_net < 20000, 'S2 net: ' || r.proposed_net || ' expected ' || expected;
  assert exists (select 1 from public.hr_attendance_audit where action = 'export' and (after ->> 'days_evaluated')::int > 0 and employee_id = 'fd000000-0000-0000-0000-0000000000e1'), 'S2 audit days_evaluated';
  raise notice 'S2 ✅ صافي الراتب بعد الاحتساب الكامل = % (غياب % يوم)', r.proposed_net, r.days_absent;
end $$;

-- ═══ S3 · بعد التصدير لا أيام غير محتسبة؛ المالية ترى المجدول/المحتسب؛ إعادة الاحتساب من الواجهة متاحة ═══
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; st jsonb; n int; begin
  st := public.hr_month_export_status(m);
  assert (st ->> 'unevaluated_days')::int = 0, 'S3 none unevaluated: ' || st::text;
  n := public.hr_attendance_evaluate_month(m);
  assert n > 0, 'S3 manual month evaluate';
end $$;
select auth.set_test_user('fd000000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  select * into r from public.finance_payroll_sheet(m) where employee_number = 'PC-1';
  assert r.scheduled_days = dim and r.unevaluated_days = 0 and r.shift_minutes = 480, 'S3 finance columns: ' || row_to_json(r)::text;
  raise notice 'S3 ✅ المالية ترى المجدول/المحتسب/دقائق الشفت';
end $$;
reset role; select set_config('auth.user_id','', false);
