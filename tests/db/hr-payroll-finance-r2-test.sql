-- 00184 · كشف المالية: الإجازة المدفوعة/غير المدفوعة، الأجر اليومي بلا استقطاع مزدوج، الإجمالي/الاستقطاعات، الترتيب (بادئة pf)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00201: هذا الاختبار يتحقق من النموذج القديم (الراتب كاملاً ناقص الغياب)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
-- 00193: هذا الاختبار يختبر التصدير مباشرة؛ بوابة «اعتماد الحضورية قبل التصدير» تُختبر في ops-attendance-two-stage-test
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('f6000000-0000-0000-0000-00000000000b', 'pf-ops@t.iq'), ('f6000000-0000-0000-0000-00000000000c', 'pf-fin@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('f6000000-0000-0000-0000-00000000000b', 'ops_room'), ('f6000000-0000-0000-0000-00000000000c', 'finance_officer')
on conflict do nothing;
insert into public.departments (id, name, code) values
  ('f6000000-0000-0000-0000-0000000000a1', 'pf قسم أ', 'PF-A'), ('f6000000-0000-0000-0000-0000000000a2', 'pf قسم ب', 'PF-B')
on conflict (code) do nothing;
-- شهري (قسم ب) + يومي (قسم أ) + ثلاثة أرقام وظيفية لاختبار الترتيب الطبيعي + بلا قسم
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin, department_id) values
  ('f6000000-0000-0000-0000-0000000000e1', 'PF-10', 'شهري عشرة',  '2024-01-01', '7401', 'f6000000-0000-0000-0000-0000000000a2'),
  ('f6000000-0000-0000-0000-0000000000e2', 'PF-9',  'يومي تسعة',   '2024-01-01', '7402', 'f6000000-0000-0000-0000-0000000000a1'),
  ('f6000000-0000-0000-0000-0000000000e3', 'PF-2',  'يومي اثنان',  '2024-01-01', '7403', 'f6000000-0000-0000-0000-0000000000a1'),
  ('f6000000-0000-0000-0000-0000000000e4', 'PF-1',  'بلا قسم',     '2024-01-01', null, null)
on conflict (employee_number) do nothing;

-- أيام الشهر الماضي تُدرج مباشرة (المحرك يحسب المشتقات عبر trg_hr_attendance_metrics)
create or replace function pg_temp.pf_day(p_emp uuid, p_day date, p_status text, p_in time, p_out time) returns void language sql as $$
  insert into public.hr_attendance_days (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, worked_minutes, is_rest_day, status, source)
  values (p_emp, p_day, 'pf', (p_day + time '08:00')::timestamp - interval '3 hours', (p_day + time '16:00')::timestamp - interval '3 hours',
          case when p_in is null then null else (p_day + p_in)::timestamp - interval '3 hours' end,
          case when p_out is null then null else (p_day + p_out)::timestamp - interval '3 hours' end,
          case when p_in is null or p_out is null then 0 else extract(epoch from (p_out - p_in))::int / 60 end, false, p_status, 'manual')
  on conflict (employee_id, work_date) do nothing
$$;
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid; t_paid uuid; t_unpaid uuid; begin
  select id into t_paid from public.hr_leave_types where code = 'annual';
  select id into t_unpaid from public.hr_leave_types where code = 'unpaid';
  foreach e in array array['f6000000-0000-0000-0000-0000000000e1'::uuid, 'f6000000-0000-0000-0000-0000000000e2'::uuid] loop
    insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, status, days) values
      (e, 'leave', 'annual', t_paid,   m + 4, m + 4, 'approved', 1),
      (e, 'leave', 'unpaid', t_unpaid, m + 5, m + 5, 'approved', 1);
    perform pg_temp.pf_day(e, m + 1, 'present', '08:00', '16:00');
    perform pg_temp.pf_day(e, m + 2, 'present', '08:00', '16:00');
    perform pg_temp.pf_day(e, m + 3, 'absent', null, null);
    perform pg_temp.pf_day(e, m + 4, 'leave', null, null);
    perform pg_temp.pf_day(e, m + 5, 'leave', null, null);
  end loop;
  perform pg_temp.pf_day('f6000000-0000-0000-0000-0000000000e3', m + 1, 'present', '08:00', '16:00');
  -- استقطاع عمليات: يوم واحد على الشهري
  insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason) values ('f6000000-0000-0000-0000-0000000000e1', m, 0, 1, 'pf مخالفة');
end $$;

-- ملفات الرواتب (المالية)
select auth.set_test_user('f6000000-0000-0000-0000-00000000000c');
select public.finance_salary_set('f6000000-0000-0000-0000-0000000000e1', 'monthly', 900000, 0, '{"نقل": 60000}', '{"ضمان": 30000}', null);
select public.finance_salary_set('f6000000-0000-0000-0000-0000000000e2', 'daily', 0, 25000, '{}', '{}', null);
select public.finance_salary_set('f6000000-0000-0000-0000-0000000000e3', 'daily', 0, 20000, '{}', '{}', null);

-- ═══ S1 · ملخص الشهر يفرّق الإجازة المدفوعة وأيام الاستقطاع حسب مصدرها ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; s record; begin
  select * into s from app.hr_month_summary(m) where employee_id = 'f6000000-0000-0000-0000-0000000000e1';
  assert s.days_present = 2 and s.days_absent = 1 and s.days_leave = 2 and s.days_leave_paid = 1 and s.days_leave_unpaid = 1, 'S1 counts: ' || row_to_json(s)::text;
  assert s.auto_days = 2 and s.auto_days_absence = 2 and s.auto_days_shortfall = 0 and s.auto_minutes = 0, 'S1 auto split: ' || row_to_json(s)::text;
  assert s.ded_days = 1, 'S1 ops days';
  raise notice 'S1 ✅ ملخص الشهر مفصّل';
end $$;

-- ═══ S2 · التصدير: الشهري = 900000+60000 − (30000 + يوم عمليات 30000 + يومان تلقائي 60000) = 840000 ═══
select auth.set_test_user('f6000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PF-10';
  assert r.gross_amount = 960000 and r.deductions_total = 120000 and r.proposed_net = 840000, 'S2 monthly: ' || row_to_json(r)::text;
  assert r.ops_deduction_days_amount = 30000 and r.auto_deduction_amount = 60000 and r.auto_absence_days = 2 and r.payable_days is null, 'S2 monthly breakdown: ' || row_to_json(r)::text;
  -- اليومي: أيام مدفوعة = حاضر 2 + إجازة مدفوعة 1 = 3 × 25000 = 75000؛ الغياب/غير المدفوعة لا تُخصم مرة ثانية
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PF-9';
  assert r.payable_days = 3 and r.gross_amount = 75000 and r.deductions_total = 0 and r.auto_deduction_amount = 0 and r.proposed_net = 75000, 'S2 daily: ' || row_to_json(r)::text;
  assert r.days_leave_paid = 1 and r.days_leave_unpaid = 1 and r.auto_absence_days = 2 and r.auto_deduction_days = 0 and r.auto_deduction_amount = 0, -- 00192: اليومي لا تُحسب أيام غيابه كأيام استقطاع (غير مدفوعة أصلاً)
     'S2 daily breakdown: ' || row_to_json(r)::text;
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PF-2';
  assert r.proposed_net = 20000 and r.gross_amount = 20000, 'S2 daily one day: ' || row_to_json(r)::text;
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PF-1';
  assert r.proposed_net is null and r.gross_amount is null and r.pay_type is null, 'S2 no salary profile → null';
  raise notice 'S2 ✅ معادلة الصافي صحيحة للشهري واليومي';
end $$;

-- ═══ S3 · الترتيب: القسم ← الرقم الوظيفي طبيعياً (2 قبل 9 قبل 10) ← بلا قسم آخراً؛ المالية ترى الأعمدة الجديدة ═══
select auth.set_test_user('f6000000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; nums text[]; r record; begin
  select array_agg(employee_number order by ord) into nums
  from (select employee_number, row_number() over () as ord from public.finance_payroll_sheet(m) where employee_number like 'PF-%') q;
  assert nums = array['PF-2', 'PF-9', 'PF-10', 'PF-1'], 'S3 order: ' || nums::text;
  select * into r from public.finance_payroll_sheet(m) where employee_number = 'PF-10';
  assert r.gross_amount = 960000 and r.deductions_total = 120000 and r.days_leave_paid = 1 and r.ops_deduction_days_amount = 30000, 'S3 finance columns: ' || row_to_json(r)::text;
  select array_agg(employee_number order by ord) into nums
  from (select employee_number, row_number() over () as ord from public.ops_month_export_rows(r.export_id) where employee_number like 'PF-%') q;
  assert nums = array['PF-2', 'PF-9', 'PF-10', 'PF-1'], 'S3 ops order: ' || nums::text;
  raise notice 'S3 ✅ ترتيب موحّد وأعمدة التفصيل متاحة للمالية';
end $$;

-- ═══ S4 · إعفاء غرفة العمليات من استقطاع يوم الغياب ينعكس في إعادة التصدير ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; begin
  update public.hr_attendance_days set deduction_waived = true, waive_reason = 'pf عذر' where employee_id = 'f6000000-0000-0000-0000-0000000000e1' and work_date = m + 3;
end $$;
select auth.set_test_user('f6000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PF-10';
  assert r.auto_deduction_days = 1 and r.auto_deduction_amount = 30000 and r.proposed_net = 870000, 'S4 waived: ' || row_to_json(r)::text;
  raise notice 'S4 ✅ الإعفاء ينعكس على الكشف';
end $$;
reset role; select set_config('auth.user_id','', false);
