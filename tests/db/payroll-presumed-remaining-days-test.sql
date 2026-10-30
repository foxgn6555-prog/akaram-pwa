-- 00392 · تصدير الكشف قبل نهاية الشهر: الأيام المتبقية تُفترض مدفوعة للشهري (بادئة pr)
--   يعيد إنتاج شكوى المستخدم: راتب 500,000 · شفت مسائي 6 ساعات · حضور كامل حتى الأمس · إجازة مدفوعة آخر الشهر · تصدير اليوم ⇒ يجب أن يكون الراتب كاملاً
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
create or replace function public.pr_export_reviewed(p_month date) returns uuid language plpgsql security definer set search_path = public, app as $$
declare x uuid; u text := current_setting('auth.user_id', true); begin
  perform set_config('auth.user_id', 'f3920000-0000-0000-0000-000000000001', true);
  x := public.ops_month_export(p_month);
  perform set_config('auth.user_id', 'f3920000-0000-0000-0000-000000000004', true); perform public.deputy_payroll_approve(x);
  perform set_config('auth.user_id', coalesce(u, ''), true);
  return x;
end $$;
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false, "backdated_max_days": 365, "salary_model": "earned_days", "salary_day_basis": "calendar_days", "pay_rest_days": false, "prorate_allowances": true}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('f3920000-0000-0000-0000-000000000001', 'pr-ops@t.iq'), ('f3920000-0000-0000-0000-000000000007', 'pr-fin@t.iq'), ('f3920000-0000-0000-0000-000000000009', 'pr-hr@t.iq'), ('f3920000-0000-0000-0000-000000000004', 'pr-adm@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('f3920000-0000-0000-0000-000000000001', 'ops_room'), ('f3920000-0000-0000-0000-000000000007', 'finance_officer'), ('f3920000-0000-0000-0000-000000000009', 'hr_officer'), ('f3920000-0000-0000-0000-000000000004', 'super_admin')
on conflict do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin) values
  ('f3920000-0000-0000-0000-0000000000ea', 'pr مسائي شهري', 'PR-A', '2024-01-01', '9201'),
  ('f3920000-0000-0000-0000-0000000000eb', 'pr مسائي إجازة بلا راتب', 'PR-B', '2024-01-01', '9202'),
  ('f3920000-0000-0000-0000-0000000000ec', 'pr يومي', 'PR-C', '2024-01-01', '9203'),
  ('f3920000-0000-0000-0000-0000000000ed', 'pr صباحي بعطلة جمعة', 'PR-D', '2024-01-01', '9204')
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('f3920000-0000-0000-0000-0000000000a1', 'pr مسائي 16-22', '16:00', '22:00', 10, '{0,1,2,3,4,5,6}'),
  ('f3920000-0000-0000-0000-0000000000a2', 'pr صباحي 8-16 بلا جمعة', '08:00', '16:00', 10, '{0,1,2,3,4,6}')
on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('f3920000-0000-0000-0000-0000000000ea', 'f3920000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('f3920000-0000-0000-0000-0000000000eb', 'f3920000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('f3920000-0000-0000-0000-0000000000ec', 'f3920000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('f3920000-0000-0000-0000-0000000000ed', 'f3920000-0000-0000-0000-0000000000a2', '2024-01-01')
on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('f3920000-0000-0000-0000-0000000000d1', 'PR-DEV-1', 'pr جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select auth.set_test_user('f3920000-0000-0000-0000-000000000007');
select public.finance_salary_set('f3920000-0000-0000-0000-0000000000ea', 'monthly', 500000, 0, '{"transport": 31000}', '{"social": 5000}', null);
select public.finance_salary_set('f3920000-0000-0000-0000-0000000000eb', 'monthly', 500000, 0, '{}', '{}', null);
select public.finance_salary_set('f3920000-0000-0000-0000-0000000000ec', 'daily', 0, 25000, '{}', '{}', null);
select public.finance_salary_set('f3920000-0000-0000-0000-0000000000ed', 'monthly', 620000, 0, '{}', '{}', null);

-- الشهر الجاري: m = أوله، today = اليوم المحلي، covered = الأيام حتى الأمس
select set_config('test.pr_m', date_trunc('month', app.hr_local_date(now()))::date::text, false);
select set_config('test.pr_today', app.hr_local_date(now())::text, false);

-- حضور كامل (16:00 → 22:00 للمسائي · 08:00 → 16:00 للصباحي) من أول الشهر حتى الأمس
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.pr_m')::date; today date := current_setting('test.pr_today')::date; d date; n int; begin
  d := m;
  while d <= today - 1 loop
    n := public.biometric_ingest('PR-DEV-1',
      '9201' || E'\t' || d::text || ' 16:00:00' || E'\t0\n' || '9201' || E'\t' || d::text || ' 22:00:00' || E'\t1\n' ||
      '9202' || E'\t' || d::text || ' 16:00:00' || E'\t0\n' || '9202' || E'\t' || d::text || ' 22:00:00' || E'\t1\n' ||
      '9203' || E'\t' || d::text || ' 16:00:00' || E'\t0\n' || '9203' || E'\t' || d::text || ' 22:00:00' || E'\t1\n' ||
      '9204' || E'\t' || d::text || ' 08:00:00' || E'\t0\n' || '9204' || E'\t' || d::text || ' 16:00:00' || E'\t1', 'ATTLOG');
    d := d + 1;
  end loop;
  perform app.hr_evaluate_month(m);
end $$;

-- إجازات آخر يوم في الشهر (مستقبلية أو اليوم): A مدفوعة (اعتيادية) · B غير مدفوعة
select auth.set_test_user('f3920000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.pr_m')::date; m_t date := (current_setting('test.pr_m')::date + interval '1 month - 1 day')::date; t uuid; r record; begin
  select id into t from public.hr_leave_types where code = 'annual';
  perform public.hr_leave_request('f3920000-0000-0000-0000-0000000000ea', t, m_t, m_t, null, null, 'اعتيادية آخر الشهر', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform public.hr_leave_request('f3920000-0000-0000-0000-0000000000eb', t, m_t, m_t, null, null, 'بدون راتب آخر الشهر', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  for r in select id from public.hr_leaves where employee_id in ('f3920000-0000-0000-0000-0000000000ea', 'f3920000-0000-0000-0000-0000000000eb') and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  assert (select count(*) from public.hr_leaves where employee_id in ('f3920000-0000-0000-0000-0000000000ea', 'f3920000-0000-0000-0000-0000000000eb') and status = 'approved') = 2, 'leaves approved';
end $$;

-- ═══ S1 · التصدير اليوم: A راتب كامل · B ناقص يوم الإجازة غير المدفوعة · C اليومي يُدفع ما عمله فقط · D بلا جُمَع متبقية ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.pr_m')::date; today date := current_setting('test.pr_today')::date; m_t date := (current_setting('test.pr_m')::date + interval '1 month - 1 day')::date;
        x uuid; r record; dim int; dr numeric; covered int; remaining int; fridays int; p record; ev_a int; ev_b int; ev_d int; begin
  dim := (m_t - m + 1); dr := round(500000::numeric / dim, 4);
  covered := greatest(0, (today - 1) - m + 1); remaining := dim - covered;
  -- اعتماد الإجازة ينشئ صف حضور (leave) ليومها حتى لو كان مستقبلياً ⇒ ذلك اليوم «مقيَّم» ولا يُفترض (لا ازدواج)
  select count(*)::int into ev_a from public.hr_attendance_days where employee_id = 'f3920000-0000-0000-0000-0000000000ea' and work_date >= today and work_date <= m_t;
  select count(*)::int into ev_b from public.hr_attendance_days where employee_id = 'f3920000-0000-0000-0000-0000000000eb' and work_date >= today and work_date <= m_t;
  select count(*)::int into ev_d from public.hr_attendance_days where employee_id = 'f3920000-0000-0000-0000-0000000000ed' and work_date >= today and work_date <= m_t;
  assert ev_a = 1 and ev_b = 1, format('leave rows pre-created a=%s b=%s', ev_a, ev_b);
  x := public.pr_export_reviewed(m);
  perform set_config('test.pr_x1', x::text, false);

  -- A: مسائي 6 ساعات · حضور كامل حتى الأمس · إجازة مدفوعة آخر الشهر ⇒ الأيام المستحقة = أيام الشهر كلها ⇒ الإجمالي = الراتب كاملاً + المخصصات
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-A';
  assert r.days_in_month = dim and r.day_rate = dr and r.shift_minutes = 360, 'S1-A rate/shift: ' || row_to_json(r)::text;
  assert r.covered_days = covered and r.days_presumed = remaining - ev_a and r.payable_days = dim, format('S1-A days: covered=%s presumed=%s payable=%s dim=%s', r.covered_days, r.days_presumed, r.payable_days, dim);
  assert r.gross_amount = 500000 + 31000 and r.proration_ratio = 1, 'S1-A gross: ' || row_to_json(r)::text;
  assert r.auto_deduction_amount = 0 and r.deductions_total = 5000 and r.proposed_net = 526000, 'S1-A net: ' || row_to_json(r)::text;
  -- أجر الدقيقة من دقائق الشفت الفعلية (360) لا 480
  select * into p from app.hr_month_presumed(m) q where q.employee_id = 'f3920000-0000-0000-0000-0000000000ea';
  assert p.presumed_from = greatest(today, m) and p.presumed_to = m_t and p.presumed_cal_days = remaining and p.presumed_unpaid_leave = 0 and p.presumed_days = remaining - ev_a, 'S1-A presumed: ' || row_to_json(p)::text;

  -- B: إجازة غير مدفوعة آخر الشهر ⇒ ناقص يوم واحد فقط
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-B';
  assert r.days_presumed = remaining - ev_b and r.days_leave_unpaid = 1 and r.payable_days = dim - 1, 'S1-B days: ' || row_to_json(r)::text;
  assert r.gross_amount = round(dr * (dim - 1), 2), format('S1-B gross %s expected %s', r.gross_amount, round(dr * (dim - 1), 2));
  -- لو حُذف صف الحضور (إعادة تقييم) تبقى الإجازة غير المدفوعة مستثناة من الافتراض
  delete from public.hr_attendance_days where employee_id = 'f3920000-0000-0000-0000-0000000000eb' and work_date = m_t;
  select * into p from app.hr_month_presumed(m) q where q.employee_id = 'f3920000-0000-0000-0000-0000000000eb';
  assert p.presumed_unpaid_leave = 1 and p.presumed_days = remaining - 1, 'S1-B unpaid: ' || row_to_json(p)::text;
  perform app.hr_evaluate_day('f3920000-0000-0000-0000-0000000000eb', m_t);

  -- C: يومي ⇒ لا افتراض — أيام الحضور الفعلية فقط
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-C';
  assert r.days_presumed = 0 and r.payable_days = covered and r.gross_amount = 25000 * covered, 'S1-C: ' || row_to_json(r)::text;

  -- D: صباحي بعطلة جمعة ⇒ الجُمَع المتبقية ليست مدفوعة (pay_rest_days=false) والأيام الماضية كما قيّمها المحرك
  select count(*)::int into fridays from generate_series(greatest(today, m), m_t, interval '1 day') g where extract(dow from g) = 5
    and not exists (select 1 from public.hr_attendance_days a where a.employee_id = 'f3920000-0000-0000-0000-0000000000ed' and a.work_date = g::date);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-D';
  assert r.days_presumed = remaining - ev_d - fridays, format('S1-D presumed=%s expected=%s', r.days_presumed, remaining - fridays);
  assert r.payable_days = r.days_present + r.days_leave_paid + r.days_presumed, 'S1-D payable: ' || row_to_json(r)::text;
  select * into p from app.hr_month_presumed(m) q where q.employee_id = 'f3920000-0000-0000-0000-0000000000ed';
  assert p.presumed_rest = fridays, 'S1-D rest: ' || row_to_json(p)::text;

  -- كشف المالية يعرض العمود الجديد
  perform set_config('auth.user_id', 'f3920000-0000-0000-0000-000000000007', true);
  select days_presumed, payable_days into r from public.finance_payroll_sheet(m) s where s.employee_number = 'PR-A';
  assert r.days_presumed = remaining - ev_a and r.payable_days = dim, 'S1 sheet: ' || row_to_json(r)::text;
  -- المطابقة لا تُبلّغ عن خلل مالي
  select bool_and(money_ok) into r from public.finance_payroll_reconcile(m) q where q.employee_number like 'PR-%';
  assert r.bool_and, 'S1 reconcile money_ok';
  perform set_config('auth.user_id', '', true);
  raise notice 'S1 ✅ التصدير قبل نهاية الشهر: الراتب كامل للشهري، ناقص الإجازة غير المدفوعة فقط، اليومي كما عمل';
end $$;

-- ═══ S2 · إعادة سحب البصمة نفسها (تكرار) ثم إعادة التصدير ⇒ النتيجة نفسها تماماً (لا تضاعف ولا نقص) ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.pr_m')::date; today date := current_setting('test.pr_today')::date; d date; n int; x uuid; r1 record; r2 record; before_punches int; after_punches int; begin
  select count(*) into before_punches from public.biometric_punches where pin in ('9201', '9204');
  d := m;
  while d <= today - 1 loop
    n := public.biometric_ingest('PR-DEV-1', '9201' || E'\t' || d::text || ' 16:00:00' || E'\t0\n' || '9201' || E'\t' || d::text || ' 22:00:00' || E'\t1\n' || '9204' || E'\t' || d::text || ' 08:00:00' || E'\t0\n' || '9204' || E'\t' || d::text || ' 16:00:00' || E'\t1', 'ATTLOG');
    d := d + 1;
  end loop;
  select count(*) into after_punches from public.biometric_punches where pin in ('9201', '9204');
  assert before_punches = after_punches, format('S2 duplicate punches %s → %s', before_punches, after_punches);
  perform app.hr_evaluate_month(m);
  select gross_amount, deductions_total, proposed_net, payable_days, days_presumed into r1 from public.hr_month_export_rows where export_id = current_setting('test.pr_x1')::uuid and employee_number = 'PR-A';
  x := public.pr_export_reviewed(m);
  select gross_amount, deductions_total, proposed_net, payable_days, days_presumed into r2 from public.hr_month_export_rows where export_id = x and employee_number = 'PR-A';
  assert row_to_json(r1)::text = row_to_json(r2)::text, format('S2 idempotent: %s vs %s', row_to_json(r1), row_to_json(r2));
  raise notice 'S2 ✅ تكرار السحب لا يغيّر الراتب';
end $$;

-- ═══ S3 · النموذج القديم full_minus_absence: التصدير المبكر لا يُنقص الراتب (شهر كامل بلا تناسب) ═══
select auth.set_test_user('f3920000-0000-0000-0000-000000000004');
select public.hr_policy_set('{"salary_model":"full_minus_absence","prorate_partial_month":true}'::jsonb);
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.pr_m')::date; x uuid; r record; begin
  x := public.pr_export_reviewed(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'PR-A';
  assert r.salary_model = 'full_minus_absence' and r.proration_ratio = 1 and r.gross_amount = 531000, 'S3 full model: ' || row_to_json(r)::text;
  raise notice 'S3 ✅ النموذج القديم';
end $$;
select auth.set_test_user('f3920000-0000-0000-0000-000000000004');
select public.hr_policy_set('{"salary_model":"earned_days"}'::jsonb);

-- ═══ S4 · شهر ماضٍ مكتمل: لا أيام مفترضة إطلاقاً (السلوك السابق محفوظ) ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare pm date := (date_trunc('month', current_setting('test.pr_m')::date) - interval '1 month')::date; r record; begin
  select * into r from app.hr_month_presumed(pm) q where q.employee_id = 'f3920000-0000-0000-0000-0000000000ea';
  assert r.employee_id is null or r.presumed_cal_days = 0, 'S4 past month presumed: ' || coalesce(row_to_json(r)::text, '∅');
  raise notice 'S4 ✅ الشهر الماضي بلا افتراض';
end $$;
select 'test ok' as result;
