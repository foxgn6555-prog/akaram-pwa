-- 00201 · الراتب الشهري بنموذج «الأيام المستحقة» (بادئة ed)
--   راتب 500,000 · داوم 9 أيام ⇒ 500,000 ÷ أيام الشهر × 9 · الإجازة المدفوعة تُضاف · الغياب لا يُخصم مرتين · النموذج القديم يبقى اختيارياً
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false, "backdated_max_days": 365}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('ed000000-0000-0000-0000-000000000001', 'ed-ops@t.iq'), ('ed000000-0000-0000-0000-000000000007', 'ed-fin@t.iq'), ('ed000000-0000-0000-0000-000000000008', 'ed-it@t.iq'),
  ('ed000000-0000-0000-0000-000000000009', 'ed-hr@t.iq'), ('ed000000-0000-0000-0000-000000000004', 'ed-adm@t.iq'), ('ed000000-0000-0000-0000-00000000000a', 'ed-a@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ed000000-0000-0000-0000-000000000001', 'ops_room'), ('ed000000-0000-0000-0000-000000000007', 'finance_officer'), ('ed000000-0000-0000-0000-000000000008', 'it_admin'),
  ('ed000000-0000-0000-0000-000000000009', 'hr_officer'), ('ed000000-0000-0000-0000-000000000004', 'super_admin'), ('ed000000-0000-0000-0000-00000000000a', 'employee')
on conflict do nothing;
select set_config('test.ed_m', (date_trunc('month', current_date) - interval '2 month')::date::text, false);
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('ed000000-0000-0000-0000-0000000000ea', 'ed000000-0000-0000-0000-00000000000a', 'ed موظف', 'ED-A', '2024-01-01', '8701') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('ed000000-0000-0000-0000-0000000000a1', 'ed شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('ed000000-0000-0000-0000-0000000000ea', 'ed000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('ed000000-0000-0000-0000-0000000000d1', 'ED-DEV-1', 'ed جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select auth.set_test_user('ed000000-0000-0000-0000-000000000007');
select public.finance_salary_set('ed000000-0000-0000-0000-0000000000ea', 'monthly', 500000, 0, '{"transport": 31000}', '{"social": 5000}', null);

-- ═══ S0 · الافتراضيات بعد الترحيل: النموذج earned_days وأجر اليوم بأيام الشهر؛ القيم غير الصالحة مرفوضة ═══
select auth.set_test_user('ed000000-0000-0000-0000-000000000008');
do $$ declare p jsonb := app.hr_policy(); begin
  assert coalesce(p ->> 'salary_model', 'earned_days') = 'earned_days', 'S0 model ' || coalesce(p ->> 'salary_model', '∅');
  assert p ->> 'salary_day_basis' = 'calendar_days', 'S0 basis ' || coalesce(p ->> 'salary_day_basis', '∅');
  begin perform public.hr_policy_set('{"salary_model":"weird"}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  begin perform public.hr_policy_set('{"pay_rest_days":"yes"}'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_POLICY_INVALID', sqlerrm; end;
  perform public.hr_policy_set('{"salary_model":"earned_days","pay_rest_days":false,"prorate_allowances":true,"auto_deduction_cap_ratio":1}'::jsonb);
  raise notice 'S0 ✅ الافتراضيات والتحقق';
end $$;

-- 9 أيام حضور كاملة (8–16) في أول الشهر
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.ed_m')::date; i int; n int; begin
  for i in 0..8 loop
    n := public.biometric_ingest('ED-DEV-1', '8701' || E'\t' || (m + i)::text || ' 08:00:00' || E'\t0\n' || '8701' || E'\t' || (m + i)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  end loop;
  perform app.hr_evaluate_month(m);
end $$;

-- ═══ S1 · 9 أيام حضور ⇒ الإجمالي = 500,000 ÷ أيام الشهر × 9 (+ مخصصات بنفس النسبة) · لا خصم غياب · الصافي = الإجمالي − الثابتة ═══
select auth.set_test_user('ed000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ed_m')::date; x uuid; r record; dim int; dr numeric; base numeric; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int; dr := round(500000::numeric / dim, 4); base := round(dr * 9, 2);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'ED-A';
  assert r.salary_model = 'earned_days' and r.days_in_month = dim and r.day_rate = dr, 'S1 model/day_rate: ' || row_to_json(r)::text;
  assert r.days_present = 9 and r.days_absent = dim - 9 and r.payable_days = 9, 'S1 days: ' || row_to_json(r)::text;
  assert r.proration_ratio = round(9::numeric / dim, 6), 'S1 ratio ' || r.proration_ratio;
  assert r.gross_amount = base + round(31000 * r.proration_ratio, 2), 'S1 gross ' || r.gross_amount || ' expected ' || (base + round(31000 * r.proration_ratio, 2));
  assert r.auto_deduction_days = 0 and r.auto_deduction_amount = 0, 'S1 no double absence deduction: ' || row_to_json(r)::text;
  assert r.proposed_net = r.gross_amount - 5000, 'S1 net ' || r.proposed_net;
  if dim = 30 then assert base = 150000.00, 'S1 30-day month ⇒ 150,000 got ' || base; end if;
  if dim = 31 then assert base = 145161.29, 'S1 31-day month ⇒ 145,161.29 got ' || base; end if;
  raise notice 'S1 ✅ % يوماً في الشهر · أجر اليوم % · 9 أيام ⇒ % · صافٍ %', dim, dr, base, r.proposed_net;
end $$;

-- ═══ S2 · إجازة مرضية مدفوعة يومان من الرصيد ⇒ 11 يوماً مستحقاً · إجازة بدون راتب لا تُحسب ═══
select auth.set_test_user('ed000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.ed_m')::date; t uuid; begin
  select id into t from public.hr_leave_types where code = 'sick';
  perform public.hr_leave_request('ed000000-0000-0000-0000-0000000000ea', t, m + 9, m + 10, null, null, 'مرضية', 'https://x/s.pdf', 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  select id into t from public.hr_leave_types where code = 'unpaid';
  perform public.hr_leave_request('ed000000-0000-0000-0000-0000000000ea', t, m + 11, m + 11, null, null, 'بدون راتب', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
end $$;
select auth.set_test_user('ed000000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  for r in select id from public.hr_leaves where employee_id = 'ed000000-0000-0000-0000-0000000000ea' and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  perform app.hr_evaluate_month(current_setting('test.ed_m')::date);
end $$;
select auth.set_test_user('ed000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ed_m')::date; x uuid; r record; dim int; dr numeric; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int; dr := round(500000::numeric / dim, 4);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'ED-A';
  assert r.days_leave_paid = 2 and r.days_leave_unpaid = 1 and r.payable_days = 11, 'S2 days: ' || row_to_json(r)::text;
  assert r.gross_amount = round(dr * 11, 2) + round(31000 * round(11::numeric / dim, 6), 2), 'S2 gross ' || r.gross_amount;
  assert r.auto_deduction_amount = 0, 'S2 unpaid leave is simply unpaid (no second deduction): ' || r.auto_deduction_amount;
  raise notice 'S2 ✅ 9 حضور + 2 مدفوعة = 11 يوماً ⇒ %', r.gross_amount;
end $$;

-- ═══ S3 · بصمة ناقصة تُعدّ حاضراً (12 يوماً) · والتأخير يبقى يُخصم (نقص الدقائق) لا الغياب ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.ed_m')::date; n int; begin
  n := public.biometric_ingest('ED-DEV-1', '8701' || E'\t' || (m + 12)::text || ' 08:05:00' || E'\t0', 'ATTLOG');                       -- دخول فقط ⇒ ناقصة
  n := public.biometric_ingest('ED-DEV-1', '8701' || E'\t' || (m + 13)::text || ' 09:30:00' || E'\t0\n' || '8701' || E'\t' || (m + 13)::text || ' 16:00:00' || E'\t1', 'ATTLOG'); -- تأخير 90 د
  perform app.hr_evaluate_month(m);
end $$;
select auth.set_test_user('ed000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ed_m')::date; x uuid; r record; dim int; dr numeric; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int; dr := round(500000::numeric / dim, 4);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'ED-A';
  assert r.days_incomplete = 1 and r.payable_days = 13, 'S3 payable (9+1 ناقصة+1 متأخر+2 مدفوعة): ' || row_to_json(r)::text;
  assert r.gross_amount = round(dr * 13, 2) + round(31000 * round(13::numeric / dim, 6), 2), 'S3 gross ' || r.gross_amount;
  -- خصم التأخير (بالدقائق أو بجزء يوم حسب الشرائح) يبقى؛ أما الغياب (auto_absence_days) فلا يدخل في الخصم إطلاقاً
  assert r.auto_deduction_amount > 0 and r.auto_deduction_days = r.auto_shortfall_days and r.auto_absence_days > 0, 'S3 lateness still deducted, absence not: ' || row_to_json(r)::text;
  assert r.auto_deduction_amount = round(r.day_rate * r.auto_shortfall_days + round(r.day_rate / 480, 4) * r.auto_deduction_minutes, 2), 'S3 amount ' || r.auto_deduction_amount;
  assert r.proposed_net = r.gross_amount - r.auto_deduction_amount - 5000, 'S3 net ' || r.proposed_net;
  raise notice 'S3 ✅ 13 يوماً مستحقاً · خصم التأخير % · صافٍ %', r.auto_deduction_amount, r.proposed_net;
end $$;

-- ═══ S4 · الشهر كاملاً حضوراً ⇒ لا يتجاوز الأساسي (500,000) ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.ed_m')::date; dim int; i int; n int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  for i in 14..dim - 1 loop
    n := public.biometric_ingest('ED-DEV-1', '8701' || E'\t' || (m + i)::text || ' 08:00:00' || E'\t0\n' || '8701' || E'\t' || (m + i)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  end loop;
  perform app.hr_evaluate_month(m);
end $$;
select auth.set_test_user('ed000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ed_m')::date; x uuid; r record; dim int; begin
  dim := extract(day from (m + interval '1 month - 1 day'))::int;
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'ED-A';
  assert r.payable_days = dim - 1 and r.days_absent = 0 and r.days_leave_unpaid = 1, 'S4 days: ' || row_to_json(r)::text;
  assert r.gross_amount <= 500000 + 31000 and r.gross_amount = round(r.day_rate * (dim - 1), 2) + round(31000 * r.proration_ratio, 2), 'S4 gross ' || r.gross_amount;
  raise notice 'S4 ✅ شهر شبه كامل: إجمالي % (أساس ≤ 500,000)', r.gross_amount;
end $$;

-- ═══ S5 · النموذج القديم (الراتب كاملاً ناقص الغياب) ما زال يعمل عند اختياره · الكشف للمالية يعرض النموذج ═══
select auth.set_test_user('ed000000-0000-0000-0000-000000000008');
select public.hr_policy_set('{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb);
select auth.set_test_user('ed000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ed_m')::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'ED-A';
  assert r.salary_model = 'full_minus_absence' and r.day_rate = round(500000::numeric / 30, 4) and r.payable_days is null, 'S5 legacy: ' || row_to_json(r)::text;
  assert r.gross_amount = 531000, 'S5 legacy gross ' || r.gross_amount;
  raise notice 'S5 ✅ النموذج القديم اختيارياً: إجمالي %', r.gross_amount;
end $$;
select auth.set_test_user('ed000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.ed_m')::date; r record; begin
  select * into r from public.finance_payroll_sheet(m) where employee_number = 'ED-A';
  assert r.salary_model = 'full_minus_absence' and r.days_rest = 0, 'S5 sheet: ' || row_to_json(r)::text;
  raise notice 'S5b ✅ كشف المالية يحمل salary_model و days_rest';
end $$;
select auth.set_test_user('ed000000-0000-0000-0000-000000000008');
select public.hr_policy_set('{"salary_model":"earned_days","salary_day_basis":"calendar_days"}'::jsonb);

-- ═══ S6 · تدقيق المالية المستقل يطابق النموذج الجديد (money_ok لكل الصفوف) ويكشف تغيّر الأيام المستحقة ═══
select auth.set_test_user('ed000000-0000-0000-0000-000000000001');
select public.ops_month_export(current_setting('test.ed_m')::date);
select auth.set_test_user('ed000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.ed_m')::date; r record; begin
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'ED-A';
  assert r.money_ok and r.ok, 'S6 reconcile: ' || array_to_string(r.issues, ',') || ' ' || r.components::text;
  assert (r.components ->> 'salary_model') = 'earned_days' and (r.live ->> 'leave_paid')::int = 2, 'S6 components ' || r.components::text || ' live ' || r.live::text;
  -- تغيير حي بعد التصدير: صف يدوي يحوّل يوم غياب إلى حاضر ⇒ PAYABLE_DAYS_CHANGED (لا يؤثر في money_ok)
  reset role; perform set_config('auth.user_id', '', false);
  update public.hr_attendance_days set status = 'present' where employee_id = 'ed000000-0000-0000-0000-0000000000ea' and work_date = m + 11;
  perform auth.set_test_user('ed000000-0000-0000-0000-000000000007');
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'ED-A';
  assert 'PAYABLE_DAYS_CHANGED' = any(r.issues) and r.money_ok and not r.attendance_ok, 'S6b issues ' || array_to_string(r.issues, ',');
  raise notice 'S6 ✅ تدقيق المالية يطابق النموذج ويكشف تغيّر الأيام المستحقة';
end $$;
