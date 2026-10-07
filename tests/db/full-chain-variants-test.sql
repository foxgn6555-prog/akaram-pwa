-- جولة التدقيق (2) — متغيرات السلسلة: عقد يومي مُعيَّن منتصف الشهر · تعديل حضور من غرفة العمليات مع تبليغ التطوير · سياسة التطوير
-- (مبالغ ثابتة / بصمة ناقصة كغياب / سقف أيام) تُعيد الاحتساب فوراً · سلفة بقسط ثابت وسلفة بنسبة من الإجمالي · تناسب الشهر الجزئي. (بادئة fv)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('fd000000-0000-0000-0000-000000000001', 'fv-ops@t.iq'), ('fd000000-0000-0000-0000-000000000003', 'fv-dep@t.iq'), ('fd000000-0000-0000-0000-000000000004', 'fv-adm@t.iq'),
  ('fd000000-0000-0000-0000-000000000006', 'fv-daily@t.iq'), ('fd000000-0000-0000-0000-000000000007', 'fv-fin@t.iq'), ('fd000000-0000-0000-0000-000000000008', 'fv-it@t.iq'),
  ('fd000000-0000-0000-0000-000000000009', 'fv-monthly@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fd000000-0000-0000-0000-000000000001', 'ops_room'), ('fd000000-0000-0000-0000-000000000003', 'deputy_director'), ('fd000000-0000-0000-0000-000000000004', 'super_admin'),
  ('fd000000-0000-0000-0000-000000000006', 'employee'), ('fd000000-0000-0000-0000-000000000007', 'finance_officer'), ('fd000000-0000-0000-0000-000000000008', 'it_admin'),
  ('fd000000-0000-0000-0000-000000000009', 'employee')
on conflict do nothing;
select set_config('test.fv_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
-- اليومي مُعيَّن في اليوم 11 من الشهر الماضي؛ الشهري قديم
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('fd000000-0000-0000-0000-0000000000e6', 'fd000000-0000-0000-0000-000000000006', 'fv عامل يومي', 'FV-D', current_setting('test.fv_m')::date + 10, '8201'),
  ('fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-000000000009', 'fv موظف شهري', 'FV-M', '2024-01-01', '8202')
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('fd000000-0000-0000-0000-0000000000a1', 'fv شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('fd000000-0000-0000-0000-0000000000e6', 'fd000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('fd000000-0000-0000-0000-0000000000d1', 'FV-DEV-1', 'fv جهاز', '+03:00', true) on conflict (serial_number) do nothing;

-- ═══ S0 · الرواتب: يومي 25,000/يوم + نقل 30,000 · شهري 900,000 ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  perform public.finance_salary_set('fd000000-0000-0000-0000-0000000000e6', 'daily', 0, 25000, '{"نقل": 30000}'::jsonb, '{}'::jsonb, null);
  perform public.finance_salary_set('fd000000-0000-0000-0000-0000000000e9', 'monthly', 900000, 0, '{}'::jsonb, '{}'::jsonb, null);
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;

-- ═══ S1 · بصمات: اليومي حاضر 3 أيام + يوم ناقص؛ الشهري حاضر يوماً وناقص يوماً ومتأخر 25 د ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.fv_m')::date; n int; begin
  n := public.biometric_ingest('FV-DEV-1',
    '8201' || E'\t' || (m + 10)::text || ' 08:00:00' || E'\t0\n' || '8201' || E'\t' || (m + 10)::text || ' 16:00:00' || E'\t1\n' ||
    '8201' || E'\t' || (m + 11)::text || ' 08:00:00' || E'\t0\n' || '8201' || E'\t' || (m + 11)::text || ' 16:00:00' || E'\t1\n' ||
    '8201' || E'\t' || (m + 12)::text || ' 08:00:00' || E'\t0\n' || '8201' || E'\t' || (m + 12)::text || ' 16:00:00' || E'\t1\n' ||
    '8201' || E'\t' || (m + 13)::text || ' 08:00:00' || E'\t0\n' ||
    '8202' || E'\t' || (m + 1)::text || ' 08:00:00' || E'\t0\n' || '8202' || E'\t' || (m + 1)::text || ' 16:00:00' || E'\t1\n' ||
    '8202' || E'\t' || (m + 2)::text || ' 08:00:00' || E'\t0\n' ||
    '8202' || E'\t' || (m + 3)::text || ' 08:25:00' || E'\t0\n' || '8202' || E'\t' || (m + 3)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
  assert n = 12, 'S1 ingest ' || n;
  assert (select status from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e6' and work_date = m + 13) = 'incomplete', 'S1 daily incomplete';
  assert (select status from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e9' and work_date = m + 2) = 'incomplete', 'S1 monthly incomplete';
  assert (select proposed_deduction_days from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e9' and work_date = m + 2) = 0, 'S1 incomplete ⇒ 0 by default';
  raise notice 'S1 ✅ البصمات';
end $$;

-- ═══ S2 · غرفة العمليات تصحح يوم اليومي الناقص (خروج 16:00) بسبب ⇒ حاضر + تدقيق + تبليغ التطوير المركزية ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fv_m')::date; a record; ok boolean := false; begin
  begin perform public.ops_attendance_edit('fd000000-0000-0000-0000-0000000000e6', m + 13, ((m + 13)::text || ' 08:00')::timestamp at time zone 'Asia/Baghdad', ((m + 13)::text || ' 16:00')::timestamp at time zone 'Asia/Baghdad', 'present', '');
  exception when others then ok := sqlerrm = 'HR_REASON_REQUIRED'; end;
  assert ok, 'S2 reason required';
  perform public.ops_attendance_edit('fd000000-0000-0000-0000-0000000000e6', m + 13, ((m + 13)::text || ' 08:00')::timestamp at time zone 'Asia/Baghdad', ((m + 13)::text || ' 16:00')::timestamp at time zone 'Asia/Baghdad', 'present', 'عطل جهاز البصمة عند الخروج');
  select * into a from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e6' and work_date = m + 13;
  assert a.status = 'present' and a.worked_minutes = 480 and a.source = 'manual' and a.edit_reason like 'عطل%', 'S2 edited: ' || row_to_json(a)::text;
  assert exists (select 1 from public.hr_attendance_audit where employee_id = 'fd000000-0000-0000-0000-0000000000e6' and work_date = m + 13 and action = 'edit'), 'S2 audit';
  assert exists (select 1 from public.notifications where user_id = 'fd000000-0000-0000-0000-000000000008' and created_at > now() - interval '1 minute'), 'S2 IT notified';
  raise notice 'S2 ✅ تعديل غرفة العمليات موثّق ومُبلَّغ للتطوير';
end $$;

-- ═══ S3 · التطوير المركزية تغيّر السياسة: البصمة الناقصة = غياب ⇒ يُعاد احتساب الشهر المفتوح فوراً؛ ثم مبالغ ثابتة وسقف أيام ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000008');
do $$ declare m date := current_setting('test.fv_m')::date; a record; ok boolean := false; begin
  perform public.hr_policy_set('{"incomplete_punch_as_absent": true}'::jsonb);
  -- الشهر الماضي ليس «الشهر الجاري» فتُعاد عبر التصدير لاحقاً؛ نتحقق من دالة اليوم مباشرة
  perform app.hr_evaluate_day('fd000000-0000-0000-0000-0000000000e9', m + 2);
  select * into a from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e9' and work_date = m + 2;
  assert a.status = 'incomplete' and a.proposed_deduction_days = 1 and a.deduction_reason like '%ناقصة%', 'S3 incomplete as absent: ' || row_to_json(a)::text;
  begin perform public.hr_policy_set('{"auto_deduction_cap_ratio": 2}'::jsonb); exception when others then ok := sqlerrm = 'HR_POLICY_INVALID'; end;
  assert ok, 'S3 invalid cap rejected';
  perform public.hr_policy_set('{"auto_deduction_amount_mode": "fixed", "fixed_absent_day_amount": 20000, "fixed_shortfall_minute_amount": 100, "max_auto_deduction_days_per_month": 3}'::jsonb);
  raise notice 'S3 ✅ السياسة';
end $$;

-- ═══ S4 · سلف: الشهري قسط ثابت 50,000 · اليومي نسبة 10% من الإجمالي ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; t uuid; begin
  select id into t from public.advance_types where name = 'سلفة نقدية عادية';
  j := public.advance_request_create('fd000000-0000-0000-0000-0000000000e9', t, 200000, 'fixed', null, 50000, null, 'قسط ثابت');
  perform set_config('test.fv_adv_m', j ->> 'id', false);
  j := public.advance_request_create('fd000000-0000-0000-0000-0000000000e6', t, 100000, 'percent', null, null, 10, 'نسبة');
  perform set_config('test.fv_adv_d', j ->> 'id', false);
end $$;
select auth.set_test_user('fd000000-0000-0000-0000-000000000003');
select public.advance_decide(current_setting('test.fv_adv_m')::uuid, true, null, null, null), public.advance_decide(current_setting('test.fv_adv_d')::uuid, true, null, null, null);
select auth.set_test_user('fd000000-0000-0000-0000-000000000004');
select public.advance_decide(current_setting('test.fv_adv_m')::uuid, true, null, null, null), public.advance_decide(current_setting('test.fv_adv_d')::uuid, true, null, null, null);
select auth.set_test_user('fd000000-0000-0000-0000-000000000007');
select public.advance_deliver(current_setting('test.fv_adv_m')::uuid, null), public.advance_deliver(current_setting('test.fv_adv_d')::uuid, null);
reset role; select set_config('auth.user_id','', false);
update public.advances set start_month = current_setting('test.fv_m')::date where id in (current_setting('test.fv_adv_m')::uuid, current_setting('test.fv_adv_d')::uuid);

-- ═══ S5 · التصدير: اليومي يُدفع له أيام الحضور فقط ولا يُخصم غيابه؛ الشهري بسقف 3 أيام ومبالغ ثابتة؛ الأقساط بحسب الطريقة ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fv_m')::date; x uuid; d record; r record; dim int := extract(day from (m + interval '1 month' - interval '1 day'))::int; auto_days numeric; begin
  perform public.ops_attendance_confirm(m);   -- 00193: اعتماد الحضورية قبل التصدير
  x := public.ops_month_export(m);
  perform set_config('test.fv_export', x::text, false);
  -- اليومي
  select * into d from public.hr_month_export_rows where export_id = x and employee_id = 'fd000000-0000-0000-0000-0000000000e6';
  assert d.period_from = m + 10 and d.covered_days = dim - 10 and d.scheduled_days = dim - 10, 'S5 daily period: ' || row_to_json(d)::text;
  assert d.days_present = 4 and d.days_incomplete = 0 and d.payable_days = 4, 'S5 daily payable: ' || row_to_json(d)::text;
  assert d.gross_amount = 25000 * 4 + 30000 and d.auto_deduction_days = 0 and d.auto_deduction_amount = 0, 'S5 daily gross/auto: ' || d.gross_amount || '/' || d.auto_deduction_amount;
  assert d.advance_installment = round((25000 * 4 + 30000) * 0.10), 'S5 daily percent installment: ' || d.advance_installment;
  assert d.proposed_net = d.gross_amount - d.advance_installment, 'S5 daily net';
  -- الشهري: غياب كل الأيام بلا بصمة + يوم ناقص كغياب ⇒ أيام كثيرة لكن السقف 3 ⇒ 3 × 20,000 + دقائق التأخير × 100
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'fd000000-0000-0000-0000-0000000000e9';
  select coalesce(sum(proposed_deduction_days), 0) into auto_days from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e9' and date_trunc('month', work_date) = m and not deduction_waived;
  assert auto_days > 3 and r.auto_deduction_days = auto_days and r.auto_deduction_days_capped, 'S5 monthly cap flag: ' || row_to_json(r)::text;
  assert r.auto_deduction_basis = 'fixed' and r.auto_deduction_amount = least(3 * 20000 + 100 * r.auto_deduction_minutes, round(900000 * app.hr_policy_num('auto_deduction_cap_ratio', 1), 2)), 'S5 monthly fixed amount: ' || r.auto_deduction_amount || ' min=' || r.auto_deduction_minutes;
  assert r.auto_deduction_minutes = (select proposed_deduction_minutes from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e9' and work_date = m + 3), 'S5 late minutes flow';
  assert r.advance_installment = 50000 and r.gross_amount = 900000 and r.proposed_net = 900000 - r.auto_deduction_amount - 50000, 'S5 monthly fixed installment/net: ' || row_to_json(r)::text;
  raise notice 'S5 ✅ التصدير: يومي % (قسط %) · شهري تلقائي % (مسقوف) قسط 50,000', d.gross_amount, d.advance_installment, r.auto_deduction_amount;
end $$;

-- ═══ S6 · كشف المالية يطابق + الاعتماد يسجّل القسطين بطريقتيهما ويقفل الشهر؛ تغيير السياسة بعد القفل لا يمسّه ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.fv_m')::date; f record; j jsonb; begin
  select * into f from public.finance_payroll_sheet(m) x where x.employee_id = 'fd000000-0000-0000-0000-0000000000e6';
  assert f.advance_installment = 13000 and f.gross_amount = 130000 and f.contract_type is not null, 'S6 finance daily row: ' || row_to_json(f)::text;
  perform public.finance_payroll_approve(current_setting('test.fv_export')::uuid, false);
  j := public.advance_get(current_setting('test.fv_adv_d')::uuid);
  assert (j ->> 'repaid_total')::numeric = 13000 and (j ->> 'remaining')::numeric = 87000, 'S6 percent posted: ' || j::text;
  j := public.advance_get(current_setting('test.fv_adv_m')::uuid);
  assert (j ->> 'repaid_total')::numeric = 50000 and (j ->> 'remaining')::numeric = 150000, 'S6 fixed posted: ' || j::text;
  assert app.hr_month_locked(m), 'S6 locked';
end $$;
select auth.set_test_user('fd000000-0000-0000-0000-000000000008');
do $$ declare m date := current_setting('test.fv_m')::date; before_amt numeric; begin
  select auto_deduction_amount into before_amt from public.hr_month_export_rows r join public.hr_month_exports x on x.id = r.export_id where x.period_month = m and x.status = 'approved' and r.employee_id = 'fd000000-0000-0000-0000-0000000000e9';
  perform public.hr_policy_set('{"auto_deduction_amount_mode": "salary", "max_auto_deduction_days_per_month": 0, "incomplete_punch_as_absent": false}'::jsonb);
  assert (select auto_deduction_amount from public.hr_month_export_rows r join public.hr_month_exports x on x.id = r.export_id where x.period_month = m and x.status = 'approved' and r.employee_id = 'fd000000-0000-0000-0000-0000000000e9') = before_amt, 'S6 locked export immutable after policy change';
  assert (select proposed_deduction_days from public.hr_attendance_days where employee_id = 'fd000000-0000-0000-0000-0000000000e9' and work_date = m + 2) = 1, 'S6 locked day not re-evaluated';
  raise notice 'S6 ✅ الاعتماد والقفل والثبات بعد تغيير السياسة';
end $$;

-- ═══ S7 · الشهر الحالي الجزئي: الشهري يُتناسب حتى أمس؛ القسط الثابت يستمر؛ قسط النسبة يُحسب من إجمالي الشهر الجديد ═══
select auth.set_test_user('fd000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; x uuid; r record; d record; cov int := greatest(0, current_date - m); begin
  perform public.ops_attendance_confirm(m);
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'fd000000-0000-0000-0000-0000000000e9';
  assert r.covered_days = cov, 'S7 covered ' || r.covered_days || ' vs ' || cov;
  if cov > 0 then
    assert r.gross_amount = least(900000, round(round(900000 / 30.0, 4) * cov, 2)), 'S7 prorated gross: ' || r.gross_amount;
    assert r.advance_installment = least(50000, r.proposed_net + r.advance_installment), 'S7 fixed installment continues: ' || r.advance_installment;
  else
    assert r.gross_amount = 0 and r.advance_installment = 0, 'S7 day-1 month: nothing due';
  end if;
  select * into d from public.hr_month_export_rows where export_id = x and employee_id = 'fd000000-0000-0000-0000-0000000000e6';
  assert d.gross_amount = 30000 + 25000 * d.days_present and d.advance_installment = least(87000, round(d.gross_amount * 0.10)), 'S7 daily percent: ' || row_to_json(d)::text;
  raise notice 'S7 ✅ الشهر الجزئي: تغطية % يوم · إجمالي الشهري % · قسط %', cov, r.gross_amount, r.advance_installment;
end $$;
reset role; select set_config('auth.user_id','', false);
