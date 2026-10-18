-- 00216/00218 · بنك الساعات (بادئة hb) — قاعدة اليوم الواحد
--   نقص اليوم = max(0, تأخير فوق السماحية − بقاء بعد النهاية) + خروج مبكر · فائض اليوم = بقاء زائد + مجيء مبكر ⇒ رصيد إجازة بسقف · لا تعويض بين الأيام · الغياب خارج البنك
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00247: التصدير يتبعه اعتماد معاون المدير المفوض (إلزامي قبل المالية) — هذا الاختبار لا يختبر المراجعة نفسها (انظر deputy-deduction-review-test) فيعتمد تلقائياً
create or replace function public.ops_month_export_reviewed(p_month date) returns uuid language plpgsql security definer set search_path = public, app as $$
declare x uuid; u text := current_setting('auth.user_id', true); begin
  x := public.ops_month_export(p_month);
  perform set_config('auth.user_id', 'b7000000-0000-0000-0000-000000000004', true); perform public.deputy_payroll_approve(x); perform set_config('auth.user_id', coalesce(u, ''), true);
  return x;
end $$;
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false, "backdated_max_days": 365, "annual_leave_days_default": 60, "shortfall_method": "hour_bank", "salary_model": "earned_days", "salary_day_basis": "calendar_days"}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('b7000000-0000-0000-0000-000000000001', 'hb-ops@t.iq'), ('b7000000-0000-0000-0000-000000000007', 'hb-fin@t.iq'), ('b7000000-0000-0000-0000-000000000008', 'hb-it@t.iq'),
  ('b7000000-0000-0000-0000-000000000009', 'hb-hr@t.iq'), ('b7000000-0000-0000-0000-000000000004', 'hb-adm@t.iq'), ('b7000000-0000-0000-0000-00000000000a', 'hb-a@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('b7000000-0000-0000-0000-000000000001', 'ops_room'), ('b7000000-0000-0000-0000-000000000007', 'finance_officer'), ('b7000000-0000-0000-0000-000000000008', 'it_admin'),
  ('b7000000-0000-0000-0000-000000000009', 'hr_officer'), ('b7000000-0000-0000-0000-000000000004', 'super_admin'), ('b7000000-0000-0000-0000-00000000000a', 'employee')
on conflict do nothing;
select set_config('test.hb_m', (date_trunc('month', current_date) - interval '2 month')::date::text, false);
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('b7000000-0000-0000-0000-0000000000ea', 'b7000000-0000-0000-0000-00000000000a', 'hb كامل', 'HB-A', '2024-01-01', '8801'),
  ('b7000000-0000-0000-0000-0000000000eb', null, 'hb معوَّض', 'HB-B', '2024-01-01', '8802'),
  ('b7000000-0000-0000-0000-0000000000ec', null, 'hb عاجز', 'HB-C', '2024-01-01', '8803'),
  ('b7000000-0000-0000-0000-0000000000ed', null, 'hb مجاز', 'HB-D', '2024-01-01', '8804') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('b7000000-0000-0000-0000-0000000000a1', 'hb شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('b7000000-0000-0000-0000-0000000000ea', 'b7000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('b7000000-0000-0000-0000-0000000000eb', 'b7000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('b7000000-0000-0000-0000-0000000000ec', 'b7000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('b7000000-0000-0000-0000-0000000000ed', 'b7000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('b7000000-0000-0000-0000-0000000000d1', 'HB-DEV-1', 'hb جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select auth.set_test_user('b7000000-0000-0000-0000-000000000007');
select public.finance_salary_set(e, 'monthly', 500000, 0, '{}', '{}', null) from unnest(array['b7000000-0000-0000-0000-0000000000ea','b7000000-0000-0000-0000-0000000000eb','b7000000-0000-0000-0000-0000000000ec','b7000000-0000-0000-0000-0000000000ed']::uuid[]) e;

-- ═══ S0 · الإعدادات: الطريقة الجديدة مقبولة، السقف الافتراضي 2، القيم الشاذة مرفوضة ═══
select auth.set_test_user('b7000000-0000-0000-0000-000000000008');
do $$ declare d jsonb := app.hr_deduction_defaults(); ok boolean; begin
  assert d ->> 'shortfall_method' = 'hour_bank' and (d ->> 'hour_bank_credit_cap_days')::numeric = 2 and not (d ? 'hour_bank_off_days_per_month'), 'S0 defaults: ' || d::text;
  assert 'hour_bank_credit_cap_days' = any (app.hr_deduction_keys()) and not ('hour_bank_off_days_per_month' = any (app.hr_deduction_keys())), 'S0 keys';
  ok := false; begin perform app.hr_deduction_validate(d || '{"hour_bank_credit_cap_days": 20}'); exception when others then ok := sqlerrm = 'HR_RULE_INVALID'; end; assert ok, 'S0 cap 20 rejected';
  perform app.hr_deduction_validate(d || '{"hour_bank_credit_cap_days": 0}');
  raise notice 'S0 ✅';
end $$;

-- بصمات الشهر: A كل الأيام 8–16 · B: يوم1 9–16 (نقص 60) · يوم2 8–17 (فائض 60) · يوم3 8:05–16 (سماحية) · يوم4 8:30–16:30 (معوَّض) · يوم5 7:45–15:45 (مجيء مبكر 15 فائض + خروج مبكر 15 نقص)
--              C عشرون يوماً 8–15 (−60 كل يوم) · D خمسة وعشرون يوماً 8–16 ثم إجازة مرضية مدفوعة 5 أيام
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.hb_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; i int; n int; s text; e text; begin
  for i in 0..dim - 1 loop
    n := public.biometric_ingest('HB-DEV-1', '8801' || E'\t' || (m + i)::text || ' 08:00:00' || E'\t0\n' || '8801' || E'\t' || (m + i)::text || ' 16:00:00' || E'\t1', 'ATTLOG');
    s := case i when 0 then '09:00:00' when 2 then '08:05:00' when 3 then '08:30:00' when 4 then '07:45:00' else '08:00:00' end;
    e := case i when 1 then '17:00:00' when 3 then '16:30:00' when 4 then '15:45:00' else '16:00:00' end;
    n := public.biometric_ingest('HB-DEV-1', '8802' || E'\t' || (m + i)::text || ' ' || s || E'\t0\n' || '8802' || E'\t' || (m + i)::text || ' ' || e || E'\t1', 'ATTLOG');
    if i < 20 then n := public.biometric_ingest('HB-DEV-1', '8803' || E'\t' || (m + i)::text || ' 08:00:00' || E'\t0\n' || '8803' || E'\t' || (m + i)::text || ' 15:00:00' || E'\t1', 'ATTLOG'); end if;
    if i < 25 then n := public.biometric_ingest('HB-DEV-1', '8804' || E'\t' || (m + i)::text || ' 08:00:00' || E'\t0\n' || '8804' || E'\t' || (m + i)::text || ' 16:00:00' || E'\t1', 'ATTLOG'); end if;
  end loop;
end $$;
select auth.set_test_user('b7000000-0000-0000-0000-000000000009');
do $$ declare m date := current_setting('test.hb_m')::date; t uuid; begin
  select id into t from public.hr_leave_types where code = 'sick';
  perform public.hr_leave_request('b7000000-0000-0000-0000-0000000000ed', t, m + 25, m + 29, null, null, 'مرضية', 'https://x/s.pdf', 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
end $$;
select auth.set_test_user('b7000000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  for r in select id from public.hr_leaves where employee_id = 'b7000000-0000-0000-0000-0000000000ed' and status = 'pending' loop perform public.hr_leave_decide(r.id, true); end loop;
  perform app.hr_evaluate_month(current_setting('test.hb_m')::date);
end $$;

-- ═══ S1 · المحرّك اليومي: نقص اليوم مقترحٌ بذاته (لا تعويض بين الأيام)، الفائض في overtime_minutes، السماحية تصفّر، البقاء يعوّض تأخير نفس اليوم ═══
do $$ declare m date := current_setting('test.hb_m')::date; d record; begin
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000eb' and work_date = m;
  assert d.shortfall_minutes = 60 and d.proposed_deduction_minutes = 60 and d.proposed_deduction_days = 0 and d.overtime_minutes = 0 and d.deduction_reason like 'نقص 60 دقيقة%بنك الساعات', 'S1 B d1: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000eb' and work_date = m + 1;
  assert d.shortfall_minutes = 0 and d.overtime_minutes = 60 and d.proposed_deduction_minutes = 0 and d.deduction_reason is null, 'S1 B d2 فائض: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000eb' and work_date = m + 2;
  assert d.shortfall_minutes = 0 and d.proposed_deduction_minutes = 0 and d.overtime_minutes = 0, 'S1 B d3 سماحية: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000eb' and work_date = m + 3;
  assert d.shortfall_minutes = 0 and d.proposed_deduction_minutes = 0 and d.overtime_minutes = 0, 'S1 B d4 معوَّض بنفس اليوم: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000eb' and work_date = m + 4;
  assert d.shortfall_minutes = 15 and d.proposed_deduction_minutes = 15 and d.overtime_minutes = 0, 'S1 B d5 مبكر دخولاً (00248: لا يُحتسب افتراضياً) وخروجاً: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000ec' and work_date = m;
  assert d.shortfall_minutes = 60 and d.proposed_deduction_minutes = 60, 'S1 C d1: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'b7000000-0000-0000-0000-0000000000ec' and work_date = m + 25;
  assert d.status = 'absent' and d.deduction_reason like 'غياب%', 'S1 C غياب خارج البنك: ' || row_to_json(d)::text;
  raise notice 'S1 ✅';
end $$;

-- ═══ S2 · الميزان: A بلا نقص ولا فائض · B نقص 75 د (60+15) وفائض 75 د (60+15) ⇒ يُستقطع 75 ولا يُعوَّض · C عجز 1200 · D إجازة مدفوعة محايدة ═══
do $$ declare m date := current_setting('test.hb_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; h record; begin
  select * into h from app.hr_hour_bank('b7000000-0000-0000-0000-0000000000ea', m);
  assert h.enabled and h.shift_minutes = 480 and h.covered_days = dim and h.days_counted = dim and h.required_days = dim, 'S2 A base: ' || row_to_json(h)::text;
  assert h.required_minutes = dim * 480 and h.credited_minutes = dim * 480 and h.net_minutes = 0 and h.deduction_minutes = 0 and h.credit_days = 0 and h.surplus_minutes = 0, 'S2 A: ' || row_to_json(h)::text;
  select * into h from app.hr_hour_bank('b7000000-0000-0000-0000-0000000000eb', m);
  assert h.deduction_minutes = 75 and h.surplus_minutes = 60 and h.net_minutes = -15 and h.days_short = 2 and h.credit_days = 0.125 and not h.credit_capped, 'S2 B no cross-day: ' || row_to_json(h)::text;
  select * into h from app.hr_hour_bank('b7000000-0000-0000-0000-0000000000ec', m);
  assert h.days_counted = 20 and h.days_absent = dim - 20 and h.required_days = 20 and h.required_minutes = 9600 and h.credited_minutes = 8400, 'S2 C base: ' || row_to_json(h)::text;
  assert h.net_minutes = -1200 and h.deduction_minutes = 1200 and h.credit_days = 0 and h.surplus_minutes = 0, 'S2 C deficit: ' || row_to_json(h)::text;
  select * into h from app.hr_hour_bank('b7000000-0000-0000-0000-0000000000ed', m);
  assert h.days_counted = 25 and h.days_leave_paid = 5 and h.required_minutes = 12000 and h.credited_minutes = 12000 and h.net_minutes = 0 and h.deduction_minutes = 0 and h.credit_days = 0, 'S2 D leave neutral: ' || row_to_json(h)::text;
  raise notice 'S2 ✅ dim=%', dim;
end $$;

-- ═══ S3 · التصدير: C يُستقطع 1200 د × أجر الدقيقة فقط · A/B رصيد إجازة 2 يوم في الدفتر · D بلا تغيير ═══
select auth.set_test_user('b7000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.hb_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; x uuid; r record; dr numeric; mr numeric; amt numeric; bal jsonb; begin
  dr := round(500000::numeric / dim, 4); mr := round(dr / 480, 4); amt := round(mr * 1200, 2);
  x := public.ops_month_export_reviewed(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'HB-C';
  assert r.hour_bank_enabled and r.hour_bank_required_minutes = 9600 and r.hour_bank_credited_minutes = 8400 and r.hour_bank_net_minutes = -1200 and r.hour_bank_credit_days = 0, 'S3 C cols: ' || row_to_json(r)::text;
  assert r.auto_deduction_minutes = 1200 and r.auto_deduction_amount = amt and r.auto_deduction_basis = 'hour_bank' and r.auto_deduction_days = 0, 'S3 C auto: ' || row_to_json(r)::text;
  assert r.payable_days = 20 and r.gross_amount = round(dr * 20, 2) and r.deductions_total = amt and r.final_net = round(dr * 20, 2) - amt, 'S3 C net: ' || row_to_json(r)::text;
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'HB-A';
  assert r.auto_deduction_minutes = 0 and r.auto_deduction_amount = 0 and r.hour_bank_credit_days = 0 and r.final_net = r.gross_amount and r.payable_days = dim, 'S3 A: ' || row_to_json(r)::text;
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'HB-B';
  assert r.auto_deduction_minutes = 75 and r.auto_deduction_amount = round(mr * 75, 2) and r.hour_bank_credit_days = 0.125 and r.final_net = r.gross_amount - round(mr * 75, 2), 'S3 B: ' || row_to_json(r)::text;
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'HB-D';
  assert r.auto_deduction_minutes = 0 and r.auto_deduction_amount = 0 and r.hour_bank_credit_days = 0 and r.payable_days = 30, 'S3 D: ' || row_to_json(r)::text;
  select count(*), coalesce(sum(days), 0) into r from public.hr_leave_ledger where kind = 'overtime' and period_month = m and employee_id in ('b7000000-0000-0000-0000-0000000000ea', 'b7000000-0000-0000-0000-0000000000eb', 'b7000000-0000-0000-0000-0000000000ec', 'b7000000-0000-0000-0000-0000000000ed');
  assert r.count = 1 and r.coalesce = 0.125, 'S3 ledger: ' || row_to_json(r)::text;
  bal := public.hr_leave_balance('b7000000-0000-0000-0000-0000000000eb', extract(year from m)::int);
  assert (bal ->> 'overtime_days')::numeric = 0.125, 'S3 balance B: ' || bal::text;
  -- إعادة التصدير لا تُكرّر القيد
  x := public.ops_month_export_reviewed(m);
  select count(*) into r from public.hr_leave_ledger where kind = 'overtime' and period_month = m and employee_id = 'b7000000-0000-0000-0000-0000000000eb';
  assert r.count = 1, 'S3 re-export idempotent';
  raise notice 'S3 ✅ أجر الدقيقة % · استقطاع C %', mr, amt;
end $$;

-- ═══ S4 · ميزان الشهر RPC: غرفة العمليات ترى الصفوف؛ الموظف لا يرى شيئاً · المطابقة لا تُعلّم تغيّراً زائفاً ═══
do $$ declare m date := current_setting('test.hb_m')::date; r record; n int; begin
  select count(*) into n from public.ops_hour_bank_month(m) where employee_number like 'HB-%';
  assert n = 4, 'S4 ops rows ' || n;
  select * into r from public.ops_hour_bank_month(m) where employee_number = 'HB-C';
  assert r.enabled and r.deduction_minutes = 1200 and r.required_days = 20 and r.full_name = 'hb عاجز', 'S4 C: ' || row_to_json(r)::text;
  raise notice 'S4 ✅';
end $$;
select auth.set_test_user('b7000000-0000-0000-0000-00000000000a');
do $$ declare n int; begin
  select count(*) into n from public.ops_hour_bank_month(current_setting('test.hb_m')::date);
  assert n = 0, 'S4 employee sees nothing ' || n;
end $$;
select auth.set_test_user('b7000000-0000-0000-0000-000000000007');
do $$ declare m date := current_setting('test.hb_m')::date; r record; begin
  select * into r from public.finance_payroll_reconcile(m) where employee_number = 'HB-C';
  assert r.issues is null or not ('AUTO_DEDUCTION_CHANGED' = any (r.issues)), 'S4 reconcile C: ' || row_to_json(r)::text;
  raise notice 'S4b ✅';
end $$;

-- ═══ S5 · سقف 0 ⇒ لا رصيد ويُحذف القيد السابق عند إعادة التصدير · طريقة أخرى ⇒ البنك متوقف ═══
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"hour_bank_credit_cap_days": 0}'::jsonb where id = 1;
select auth.set_test_user('b7000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.hb_m')::date; x uuid; n int; h record; begin
  x := public.ops_month_export_reviewed(m);
  select count(*) into n from public.hr_leave_ledger where kind = 'overtime' and period_month = m and employee_id = 'b7000000-0000-0000-0000-0000000000eb';
  assert n = 0, 'S5 cap 0 ⇒ ledger removed ' || n;
  select * into h from app.hr_hour_bank('b7000000-0000-0000-0000-0000000000eb', m);
  assert h.credit_days = 0 and h.credit_capped and h.surplus_minutes = 60, 'S5 B: ' || row_to_json(h)::text;
  raise notice 'S5 ✅';
end $$;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"shortfall_method": "actual"}'::jsonb where id = 1;
do $$ declare m date := current_setting('test.hb_m')::date; h record; begin
  select * into h from app.hr_hour_bank('b7000000-0000-0000-0000-0000000000ec', m);
  assert not h.enabled, 'S5 disabled';
  raise notice 'S5b ✅';
end $$;
select 'hour-bank test ok' as test_ok;

-- ═══ S6 (00217) · كشف المالية يحمل أعمدة البنك ═══
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"shortfall_method": "hour_bank", "hour_bank_credit_cap_days": 2}'::jsonb where id = 1;
select auth.set_test_user('b7000000-0000-0000-0000-000000000001');
select public.ops_month_export_reviewed(current_setting('test.hb_m')::date);
select auth.set_test_user('b7000000-0000-0000-0000-000000000007');
do $$ declare r record; begin
  select * into r from public.finance_payroll_sheet(current_setting('test.hb_m')::date) where employee_number = 'HB-C';
  assert r.hour_bank_enabled and r.hour_bank_net_minutes = -1200 and r.hour_bank_required_minutes = 9600 and r.auto_deduction_minutes = 1200, 'S6 sheet C: ' || row_to_json(r)::text;
  select * into r from public.finance_payroll_sheet(current_setting('test.hb_m')::date) where employee_number = 'HB-A';
  assert r.hour_bank_credit_days = 0 and r.hour_bank_net_minutes = 0, 'S6 sheet A: ' || row_to_json(r)::text;
  raise notice 'S6 ✅';
end $$;

-- ═══ S7 (00218) · غرفة العمليات: لا إلغاء استقطاع · التعديل محصور بالبصمة الناقصة/الغياب ═══
select auth.set_test_user('b7000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.hb_m')::date; ok boolean; begin
  ok := false; begin perform public.ops_deduction_waive('b7000000-0000-0000-0000-0000000000ec', m, true, 'سبب'); exception when others then ok := sqlerrm = 'HR_WAIVE_NOT_ALLOWED'; end; assert ok, 'S7 waive blocked';
  ok := false; begin perform public.ops_attendance_edit('b7000000-0000-0000-0000-0000000000ea', m, (m::timestamp + time '05:00')::timestamptz, (m::timestamp + time '13:00')::timestamptz, 'present', 'سبب'); exception when others then ok := sqlerrm = 'HR_EDIT_LIMITED'; end; assert ok, 'S7 edit present blocked';
  perform public.ops_attendance_edit('b7000000-0000-0000-0000-0000000000ec', m + 25, (m + 25)::timestamp + time '05:00', (m + 25)::timestamp + time '13:00', 'present', 'حضر فعلاً والجهاز معطل');
  raise notice 'S7 ✅';
end $$;
select auth.set_test_user('b7000000-0000-0000-0000-000000000004');
do $$ declare m date := current_setting('test.hb_m')::date; begin
  perform public.ops_deduction_waive('b7000000-0000-0000-0000-0000000000ec', m, true, 'سبب (مدير النظام)');
  perform public.ops_deduction_waive('b7000000-0000-0000-0000-0000000000ec', m, false, 'إرجاع');
  raise notice 'S7b ✅';
end $$;
select 'hour-bank test ok (00218)' as test_ok;
