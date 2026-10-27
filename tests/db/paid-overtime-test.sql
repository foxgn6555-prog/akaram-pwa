-- 00353 · الساعات الإضافية المدفوعة (بادئة po): الدقائق الخام قبل/بعد الشفت، الإعداد (وحدة/نطاق/كتلة)، أجر الساعة من الراتب أو ثابت،
--        صرف/رفض/إلغاء المعاون، السطر في الكشف يُضاف إلى الصافي دون الإجمالي/الضريبة، المطابقة والمعاون، توقّف رصيد الإجازات، شهر الراتب المرحَّل، الصلاحيات
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('d7000000-0000-0000-0000-000000000001', 'po-ops@t.iq'), ('d7000000-0000-0000-0000-000000000003', 'po-dep@t.iq'), ('d7000000-0000-0000-0000-000000000007', 'po-fin@t.iq'), ('d7000000-0000-0000-0000-000000000009', 'po-it@t.iq'), ('d7000000-0000-0000-0000-000000000005', 'po-hr@t.iq') on conflict do nothing;
insert into public.user_roles (user_id, role) values ('d7000000-0000-0000-0000-000000000001', 'ops_room'), ('d7000000-0000-0000-0000-000000000003', 'deputy_director'), ('d7000000-0000-0000-0000-000000000007', 'finance_officer'), ('d7000000-0000-0000-0000-000000000009', 'it_admin'), ('d7000000-0000-0000-0000-000000000005', 'hr_officer') on conflict do nothing;
insert into public.departments (id, name, code) values ('d7000000-0000-0000-0000-0000000000d1', 'po النظافة', 'POD') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin, department_id) values
  ('d7000000-0000-0000-0000-0000000000e1', 'po موظف شهري', 'PO-A', '2024-01-01', '7801', 'd7000000-0000-0000-0000-0000000000d1'),
  ('d7000000-0000-0000-0000-0000000000e2', 'po موظف يومي', 'PO-B', '2024-01-01', '7802', 'd7000000-0000-0000-0000-0000000000d1'),
  ('d7000000-0000-0000-0000-0000000000e3', 'po موظف بلا إضافي', 'PO-C', '2024-01-01', '7803', 'd7000000-0000-0000-0000-0000000000d1') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('d7000000-0000-0000-0000-0000000000a1', 'po شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select e, 'd7000000-0000-0000-0000-0000000000a1', '2024-01-01' from unnest(array['d7000000-0000-0000-0000-0000000000e1','d7000000-0000-0000-0000-0000000000e2','d7000000-0000-0000-0000-0000000000e3']::uuid[]) e on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('d7000000-0000-0000-0000-0000000000d9', 'PO-DEV-1', 'po جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.po_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- بصمات الشهر الماضي (شفت 8–16):
--   A: كل الأيام 08:00–16:00 إلا: اليوم 1 → 07:00–17:30 (قبل 60 + بعد 90) · اليوم 2 → 08:20–17:00 (تأخير 20 فوق السماحية ⇒ البقاء 60 − 20 = 40 بعد) · اليوم 3 → 07:50–16:20 (10 + 20 = 30 بالضبط = الكتلة)
--        اليوم 4 → 07:55–16:15 (5 + 15 = 20 < الكتلة ⇒ 0) · اليوم 5 → 06:00–15:00 (مجيء مبكر 120 يغطي الخروج المبكر 60 ⇒ قبل 60 فقط)
--   B (يومي): اليوم 1 → 08:00–18:00 (بعد 120) · باقي الأيام عادي     C: عادي
do $$ declare m date := current_setting('test.po_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; i int; n int; ci text; co text; begin
  for i in 0..dim - 1 loop
    ci := '08:00:00'; co := '16:00:00';
    if i = 0 then ci := '07:00:00'; co := '17:30:00'; elsif i = 1 then ci := '08:20:00'; co := '17:00:00'; elsif i = 2 then ci := '07:50:00'; co := '16:20:00';
    elsif i = 3 then ci := '07:55:00'; co := '16:15:00'; elsif i = 4 then ci := '06:00:00'; co := '15:00:00'; end if;
    n := public.biometric_ingest('PO-DEV-1', '7801' || E'\t' || (m + i)::text || ' ' || ci || E'\t0\n7801\t' || (m + i)::text || ' ' || co || E'\t1', 'ATTLOG');
    n := public.biometric_ingest('PO-DEV-1', '7802' || E'\t' || (m + i)::text || E' 08:00:00\t0\n7802\t' || (m + i)::text || case when i = 0 then E' 18:00:00\t1' else E' 16:00:00\t1' end, 'ATTLOG');
    n := public.biometric_ingest('PO-DEV-1', '7803' || E'\t' || (m + i)::text || E' 08:00:00\t0\n7803\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG');
  end loop;
  perform app.hr_evaluate_month(m);
end $$;
select auth.set_test_user('d7000000-0000-0000-0000-000000000007');
select public.finance_salary_set('d7000000-0000-0000-0000-0000000000e1', 'monthly', 900000, 0, '{}', '{}', null);
select public.finance_salary_set('d7000000-0000-0000-0000-0000000000e2', 'daily', 0, 40000, '{}', '{}', null);
select public.finance_salary_set('d7000000-0000-0000-0000-0000000000e3', 'monthly', 600000, 0, '{}', '{}', null);
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;
reset role; select set_config('auth.user_id','', false);

-- ═══ T1 · الدقائق الخام لكل يوم (قبل/بعد) — البقاء يغطي تأخير اليوم أولاً، ويوم النقص بلا إضافي ═══
do $$ declare m date := current_setting('test.po_m')::date; r record; begin
  select ot_early_minutes e, ot_late_minutes l into r from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and work_date = m;      assert r.e = 60 and r.l = 90, 'T1 d1: ' || r.e || '/' || r.l;
  select ot_early_minutes e, ot_late_minutes l into r from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and work_date = m + 1;  assert r.e = 0 and r.l = 40, 'T1 d2: ' || r.e || '/' || r.l;
  select ot_early_minutes e, ot_late_minutes l into r from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and work_date = m + 2;  assert r.e = 10 and r.l = 20, 'T1 d3: ' || r.e || '/' || r.l;
  select ot_early_minutes e, ot_late_minutes l into r from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and work_date = m + 3;  assert r.e = 5 and r.l = 15, 'T1 d4: ' || r.e || '/' || r.l;
  select ot_early_minutes e, ot_late_minutes l, shortfall_minutes s into r from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and work_date = m + 4;  assert r.e = 60 and r.l = 0 and r.s = 0, 'T1 d5: ' || r.e || '/' || r.l || ' short ' || r.s;
  select ot_early_minutes e, ot_late_minutes l into r from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e2' and work_date = m;      assert r.e = 0 and r.l = 120, 'T1 B d1: ' || r.e || '/' || r.l;
  assert (select count(*) from public.hr_attendance_days where employee_id = 'd7000000-0000-0000-0000-0000000000e3' and (ot_early_minutes > 0 or ot_late_minutes > 0)) = 0, 'T1 C must be 0';
  raise notice 'T1 ✅ الدقائق الخام قبل/بعد الشفت';
end $$;

-- ═══ T2 · الافتراضي متوقف: الصرف مرفوض، ورصيد الإجازات من الإضافي يستمر كما كان ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; ok boolean := false; begin
  j := public.deputy_overtime_overview(current_setting('test.po_m')::date);
  assert (j -> 'settings' ->> 'enabled')::boolean = false and j -> 'settings' ->> 'unit' = 'hours', 'T2 settings: ' || (j -> 'settings')::text;
  begin perform public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e1', current_setting('test.po_m')::date, null); exception when others then ok := sqlerrm like '%OVERTIME_DISABLED%'; end;
  assert ok, 'T2 pay must fail when disabled';
  raise notice 'T2 ✅ متوقف افتراضياً';
end $$;
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.po_m')::date; n int; begin
  n := app.hr_overtime_credit(m);
  assert exists (select 1 from public.hr_leave_ledger where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and period_month = m and kind = 'overtime'), 'T2 leave credit must exist while disabled';
  raise notice 'T2b ✅ رصيد الإجازات يستمر ما دام الصرف متوقفاً';
end $$;

-- ═══ T3 · التفعيل من التطوير المركزية فقط + التحقق من القيم ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000005');
do $$ declare ok boolean := false; begin
  begin perform public.hr_policy_set('{"paid_overtime_enabled": true}'::jsonb); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%' or sqlerrm like '%PERMISSION_DENIED%'; end;
  assert ok, 'T3 hr must not toggle';
end $$;
select auth.set_test_user('d7000000-0000-0000-0000-000000000009');
do $$ declare ok boolean := false; begin
  begin perform public.hr_policy_set('{"paid_overtime_unit": "weeks"}'::jsonb); exception when others then ok := sqlerrm like '%HR_POLICY_INVALID%'; end;
  assert ok, 'T3 invalid unit must fail';
  perform public.hr_policy_set('{"paid_overtime_enabled": true, "paid_overtime_unit": "hours", "paid_overtime_before_shift": true, "paid_overtime_after_shift": true, "paid_overtime_min_block_minutes": 30}'::jsonb);
  assert app.paid_overtime_enabled(), 'T3 enabled';
  raise notice 'T3 ✅ التفعيل من التطوير المركزية';
end $$;

-- ═══ T4 · الاحتساب: الوحدة ساعات كاملة، الكتلة 30، قبل+بعد؛ أجر الساعة من الراتب = (900,000 ÷ أيام الشهر) ÷ 8 ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.po_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; r record; exp_rate numeric; begin
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e1');
  -- المحتسب: d1 150 + d2 40 + d3 30 (= الكتلة) + d4 0 (< الكتلة) + d5 60 = 280 دقيقة ⇒ 4 ساعات كاملة = 240 دقيقة
  assert r.early_minutes = 135 and r.late_minutes = 165 and r.counted_minutes = 280 and r.payable_minutes = 240 and r.days_count = 4, 'T4 A minutes: ' || row_to_json(r)::text;
  exp_rate := round(round(900000::numeric / dim, 4) / 480 * 60, 2);
  assert r.hour_rate = exp_rate and r.rate_source = 'salary' and r.amount = round(4 * exp_rate, 2), 'T4 A rate: ' || r.hour_rate || ' exp ' || exp_rate || ' amt ' || r.amount;
  -- B يومي: 120 دقيقة = ساعتان × (40,000 ÷ 8 = 5,000) = 10,000
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e2');
  assert r.payable_minutes = 120 and r.hour_rate = 5000 and r.amount = 10000, 'T4 B: ' || row_to_json(r)::text;
  assert not exists (select 1 from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e3')), 'T4 C none';
  raise notice 'T4 ✅ الاحتساب بالساعات الكاملة وأجر الساعة من الراتب (A % للساعة)', exp_rate;
end $$;

-- ═══ T5 · الإعداد يغيّر الاحتساب: بالدقيقة ⇒ 280 د · بعد الشفت فقط ⇒ d1 90 + d2 40 + d3 20 (< 30 ⇒ 0) = 130 · قبل فقط ⇒ d1 60 + d3 10 (<30) + d5 60 = 120 ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.po_m')::date; r record; begin
  perform public.hr_policy_set('{"paid_overtime_unit": "minutes"}'::jsonb);
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e1'); assert r.payable_minutes = 280, 'T5 minutes: ' || r.payable_minutes;
  perform public.hr_policy_set('{"paid_overtime_before_shift": false}'::jsonb);
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e1'); assert r.counted_minutes = 130, 'T5 after only: ' || r.counted_minutes;
  perform public.hr_policy_set('{"paid_overtime_before_shift": true, "paid_overtime_after_shift": false}'::jsonb);
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e1'); assert r.counted_minutes = 120, 'T5 before only: ' || r.counted_minutes;
  perform public.hr_policy_set('{"paid_overtime_after_shift": true, "paid_overtime_unit": "hours", "paid_overtime_min_block_minutes": 0}'::jsonb);
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e1'); assert r.counted_minutes = 300 and r.payable_minutes = 300, 'T5 block 0: ' || r.counted_minutes;
  perform public.hr_policy_set('{"paid_overtime_min_block_minutes": 30}'::jsonb);
  raise notice 'T5 ✅ قبل/بعد الشفت والوحدة والكتلة';
end $$;

-- ═══ T6 · عند التفعيل يتوقف تحويل الإضافي إلى رصيد (ويُحذف ما سبق لهذا الشهر) ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.po_m')::date; n int; begin
  n := app.hr_overtime_credit(m);
  assert n = 0 and not exists (select 1 from public.hr_leave_ledger where period_month = m and kind = 'overtime'), 'T6 no leave credit when paid';
  n := app.hr_hour_bank_credit(m);
  assert n = 0, 'T6 hour bank credit must be 0';
  raise notice 'T6 ✅ لا ازدواج مع رصيد الإجازات';
end $$;

-- ═══ T7 · الصلاحيات: غير المعاون لا يصرف؛ الرفض بلا سبب مرفوض؛ الصرف لمن لا دقائق له مرفوض ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000007');
do $$ declare ok boolean := false; begin
  begin perform public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e1', current_setting('test.po_m')::date, null); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%' or sqlerrm like '%PERMISSION_DENIED%'; end;
  assert ok, 'T7 finance must not pay';
  ok := false;
  begin perform public.deputy_overtime_overview(current_setting('test.po_m')::date); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%' or sqlerrm like '%PERMISSION_DENIED%'; end;
  assert ok, 'T7 finance must not view overview';
end $$;
select auth.set_test_user('d7000000-0000-0000-0000-000000000003');
do $$ declare ok boolean := false; begin
  begin perform public.deputy_overtime_reject('d7000000-0000-0000-0000-0000000000e1', current_setting('test.po_m')::date, ''); exception when others then ok := sqlerrm like '%OVERTIME_REASON_REQUIRED%'; end;
  assert ok, 'T7 reject needs reason';
  ok := false;
  begin perform public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e3', current_setting('test.po_m')::date, null); exception when others then ok := sqlerrm like '%OVERTIME_NOTHING_TO_PAY%'; end;
  assert ok, 'T7 nothing to pay for C';
  raise notice 'T7 ✅ الصلاحيات والتحقق';
end $$;

-- ═══ T8 · أجر ثابت للموظف B بقرار المعاون (افتراضياً متوقف) ⇒ 2 ساعة × 7,000 = 14,000 ═══
do $$ declare m date := current_setting('test.po_m')::date; r record; ok boolean := false; j jsonb; begin
  begin perform public.deputy_overtime_rate_set('d7000000-0000-0000-0000-0000000000e2', true, 0, null); exception when others then ok := sqlerrm like '%OVERTIME_RATE_INVALID%'; end;
  assert ok, 'T8 zero fixed rate rejected';
  perform public.deputy_overtime_rate_set('d7000000-0000-0000-0000-0000000000e2', true, 7000, 'اتفاق خاص');
  select * into r from app.paid_overtime_month(m, 'd7000000-0000-0000-0000-0000000000e2');
  assert r.hour_rate = 7000 and r.rate_source = 'fixed' and r.amount = 14000, 'T8 fixed: ' || row_to_json(r)::text;
  select count(*) into r from public.deputy_overtime_rates() x where x.employee_number = 'PO-B' and x.enabled and x.hourly_amount = 7000; assert r.count = 1, 'T8 rates list';
  raise notice 'T8 ✅ أجر الساعة الثابت';
end $$;

-- ═══ T9 · الصرف: A (4 ساعات من الراتب) و B (14,000 ثابت)؛ رفض C بسبب؛ لا تكرار ═══
do $$ declare m date := current_setting('test.po_m')::date; j jsonb; ok boolean := false; begin
  j := public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e1', m, 'ساعات مشروع الحملة');
  assert j ->> 'status' = 'paid' and (j ->> 'payable_minutes')::int = 240 and (j ->> 'payroll_month')::date = m, 'T9 A: ' || j::text;
  perform set_config('test.po_amount_a', j ->> 'amount', false);
  j := public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e2', m, null);
  assert (j ->> 'amount')::numeric = 14000 and j ->> 'rate_source' = 'fixed', 'T9 B: ' || j::text;
  begin perform public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e1', m, null); exception when others then ok := sqlerrm like '%OVERTIME_ALREADY_DECIDED%'; end;
  assert ok, 'T9 no double pay';
  j := public.deputy_overtime_overview(m);
  assert (select count(*) from jsonb_array_elements(j -> 'employees') e where e -> 'payout' ->> 'status' = 'paid') = 2, 'T9 overview paid count';
  assert (select count(*) from public.deputy_overtime_days('d7000000-0000-0000-0000-0000000000e1', m)) = 5, 'T9 days detail (5 days with raw minutes)';
  raise notice 'T9 ✅ الصرف وعدم التكرار (A %)', current_setting('test.po_amount_a');
end $$;

-- ═══ T10 · التصدير: السطر يُضاف إلى الصافي فقط — الإجمالي والاستقطاعات والضريبة بلا تغيير؛ المطابقة خضراء؛ المعاون لا يمسحه ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000001');
do $$ declare x uuid; begin x := public.ops_month_export(current_setting('test.po_m')::date); perform set_config('test.po_x1', x::text, false); end $$;
reset role; select set_config('auth.user_id','', false);
do $$ declare a public.hr_month_export_rows; b public.hr_month_export_rows; c public.hr_month_export_rows; amt_a numeric := current_setting('test.po_amount_a')::numeric; begin
  select * into a from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e1';
  select * into b from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e2';
  select * into c from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e3';
  assert a.overtime_amount = amt_a and a.overtime_paid_minutes = 240, 'T10 A ot: ' || a.overtime_amount;
  assert a.proposed_net = round(greatest(0, a.gross_amount - a.deductions_total) + amt_a, 2) and a.final_net = a.proposed_net, 'T10 A net: ' || a.proposed_net || ' gross ' || a.gross_amount || ' ded ' || a.deductions_total;
  assert a.rented_tax_amount = 0 and a.deductions_total = coalesce(a.auto_deduction_amount, 0), 'T10 A: overtime must not enter deductions/tax';
  assert b.overtime_amount = 14000 and b.proposed_net = round(greatest(0, b.gross_amount - b.deductions_total) + 14000, 2), 'T10 B: ' || b.proposed_net;
  assert c.overtime_amount = 0 and c.proposed_net = round(greatest(0, c.gross_amount - c.deductions_total), 2), 'T10 C: ' || c.proposed_net;
  raise notice 'T10 ✅ السطر في الكشف يُضاف للصافي فقط (A +% · B +14,000)', amt_a;
end $$;
select auth.set_test_user('d7000000-0000-0000-0000-000000000007');
do $$ declare n_bad int; r record; begin
  select count(*) into n_bad from public.finance_payroll_reconcile(current_setting('test.po_m')::date) rc where not rc.money_ok;
  assert n_bad = 0, 'T10 reconcile money mismatches: ' || n_bad;
  select * into r from public.finance_payroll_reconcile(current_setting('test.po_m')::date) rc where rc.employee_id = 'd7000000-0000-0000-0000-0000000000e1';
  assert (r.components ->> 'overtime')::numeric = current_setting('test.po_amount_a')::numeric and not ('OVERTIME_CHANGED' = any(r.issues)), 'T10 reconcile components: ' || r.components::text;
  raise notice 'T10b ✅ المطابقة خضراء مع سطر الإضافي';
end $$;
-- المعاون يعيد الاحتساب (deputy_recompute) ⇒ الصافي يبقى شاملاً الإضافي
select auth.set_test_user('d7000000-0000-0000-0000-000000000003');
do $$ declare a public.hr_month_export_rows; before_net numeric; begin
  select final_net into before_net from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e1';
  perform app.deputy_recompute(current_setting('test.po_x1')::uuid);
  select * into a from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e1';
  assert a.final_net = before_net and a.final_net = a.proposed_net, 'T10c recompute lost overtime: ' || a.final_net || ' vs ' || before_net;
  raise notice 'T10c ✅ إعادة احتساب المعاون تحفظ السطر';
end $$;

-- ═══ T11 · إلغاء قرار بعد التصدير ⇒ يُحذف من الصف المفتوح فوراً؛ ثم صرف جديد يُطبَّق فوراً (شهر رواتب غير معتمد) ═══
do $$ declare m date := current_setting('test.po_m')::date; p uuid; b public.hr_month_export_rows; j jsonb; begin
  select id into p from public.hr_overtime_payouts where employee_id = 'd7000000-0000-0000-0000-0000000000e2' and period_month = m and status = 'paid';
  perform public.deputy_overtime_cancel(p, 'خطأ في الأجر');
  select * into b from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e2';
  assert b.overtime_amount = 0 and b.proposed_net = round(greatest(0, b.gross_amount - b.deductions_total), 2) and b.final_net = b.proposed_net, 'T11 cancel: ' || b.proposed_net;
  perform public.deputy_overtime_rate_set('d7000000-0000-0000-0000-0000000000e2', false, 0, null);
  j := public.deputy_overtime_pay('d7000000-0000-0000-0000-0000000000e2', m, null);
  assert (j ->> 'amount')::numeric = 10000 and j ->> 'rate_source' = 'salary', 'T11 repay from salary: ' || j::text;
  select * into b from public.hr_month_export_rows where export_id = current_setting('test.po_x1')::uuid and employee_id = 'd7000000-0000-0000-0000-0000000000e2';
  assert b.overtime_amount = 10000 and b.proposed_net = round(greatest(0, b.gross_amount - b.deductions_total) + 10000, 2), 'T11 repay row: ' || b.proposed_net;
  assert (select count(*) from public.deputy_overtime_history(50) h where h.employee_number = 'PO-B') = 2, 'T11 history rows';
  raise notice 'T11 ✅ الإلغاء وإعادة الصرف تنعكس على الكشف المفتوح';
end $$;

-- ═══ T12 · بعد اعتماد المالية: الشهر مقفل ⇒ صرف جديد عن الشهر نفسه يُرحَّل إلى أول شهر راتب غير معتمد؛ إلغاء المصروف المعتمد مرفوض ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000003');
select public.deputy_payroll_approve(current_setting('test.po_x1')::uuid);
select auth.set_test_user('d7000000-0000-0000-0000-000000000007');
select public.finance_payroll_approve(current_setting('test.po_x1')::uuid, true);
select auth.set_test_user('d7000000-0000-0000-0000-000000000003');
do $$ declare m date := current_setting('test.po_m')::date; p uuid; ok boolean := false; j jsonb; nm date; begin
  select id into p from public.hr_overtime_payouts where employee_id = 'd7000000-0000-0000-0000-0000000000e1' and period_month = m and status = 'paid';
  begin perform public.deputy_overtime_cancel(p, 'محاولة بعد الاعتماد'); exception when others then ok := sqlerrm like '%HR_MONTH_LOCKED%'; end;
  assert ok, 'T12 cancel after approve must fail';
  j := public.deputy_overtime_overview(m);
  assert (j ->> 'month_locked')::boolean and (j ->> 'payroll_month')::date = (m + interval '1 month')::date, 'T12 payroll month hint: ' || j::text;
  -- إلغاء قرار الرفض (لا أثر مالي) مسموح حتى بعد القفل
  perform public.deputy_overtime_reject('d7000000-0000-0000-0000-0000000000e3', m, 'لا دقائق');
  select id into p from public.hr_overtime_payouts where employee_id = 'd7000000-0000-0000-0000-0000000000e3' and period_month = m and status = 'rejected';
  perform public.deputy_overtime_cancel(p, 'تراجع');
  raise notice 'T12 ✅ القفل بعد اعتماد المالية والترحيل لشهر لاحق';
end $$;

-- ═══ T13 · الكشف للمالية يحمل العمودين الجديدين؛ لا كشف للموظف ═══
select auth.set_test_user('d7000000-0000-0000-0000-000000000007');
do $$ declare r record; begin
  select * into r from public.finance_payroll_sheet(current_setting('test.po_m')::date) s where s.employee_id = 'd7000000-0000-0000-0000-0000000000e1';
  assert r.overtime_amount = current_setting('test.po_amount_a')::numeric and r.overtime_paid_minutes = 240, 'T13 sheet: ' || coalesce(r.overtime_amount::text, 'null');
  raise notice 'T13 ✅ عمودا الكشف';
end $$;
reset role; select set_config('auth.user_id','', false);
do $$ begin
  assert (select count(*) from app.data_retention_catalog() k where k.table_name in ('hr_overtime_rates', 'hr_overtime_payouts') and not k.deletable) = 2, 'T13 retention catalog';
  assert exists (select 1 from public.permission_units where key = 'deputy.overtime' and actions @> '{view,decide,edit}'), 'T13 permission unit';
end $$;
-- إعادة الإعداد إلى الافتراضي كي لا تتأثر اختبارات أخرى
select auth.set_test_user('d7000000-0000-0000-0000-000000000009');
select public.hr_policy_set('{"paid_overtime_enabled": false}'::jsonb);
reset role; select set_config('auth.user_id','', false);
