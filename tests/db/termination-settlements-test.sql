-- 00355 · المنتهية خدماتهم والتصفية النهائية (بادئة ts): فتح الملف تلقائياً عند أي إنهاء خدمة، تبليغ المدير المباشر والمالية،
--        بنود التصفية بنفس معادلات الكشف (راتب تناسبي حتى آخر يوم + تعويض الإجازات − السلف)، الاستبعاد من كشف شهر الإنهاء،
--        اعتماد/تسليم، الذمة السالبة (تسديد/إعفاء بسبب)، إقفال السلف، الصلاحيات، سجل الأحداث، كتالوج الاحتفاظ.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('d8000000-0000-0000-0000-000000000001', 'ts-ops@t.iq'), ('d8000000-0000-0000-0000-000000000005', 'ts-hr@t.iq'),
  ('d8000000-0000-0000-0000-000000000007', 'ts-fin@t.iq'), ('d8000000-0000-0000-0000-000000000008', 'ts-mgr@t.iq'), ('d8000000-0000-0000-0000-000000000003', 'ts-dep@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('d8000000-0000-0000-0000-000000000001', 'ops_room'), ('d8000000-0000-0000-0000-000000000005', 'hr_officer'),
  ('d8000000-0000-0000-0000-000000000007', 'finance_officer'), ('d8000000-0000-0000-0000-000000000008', 'department_manager'), ('d8000000-0000-0000-0000-000000000003', 'deputy_director') on conflict do nothing;
insert into public.departments (id, name, code) values ('d8000000-0000-0000-0000-0000000000d1', 'ts النقل', 'TSD') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin, department_id, user_id) values
  ('d8000000-0000-0000-0000-0000000000e9', 'ts المدير المباشر', 'TS-M', '2023-01-01', '7809', 'd8000000-0000-0000-0000-0000000000d1', 'd8000000-0000-0000-0000-000000000008') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin, department_id, manager_id) values
  ('d8000000-0000-0000-0000-0000000000e1', 'ts مستقيل شهري', 'TS-A', '2024-01-01', '7811', 'd8000000-0000-0000-0000-0000000000d1', 'd8000000-0000-0000-0000-0000000000e9'),
  ('d8000000-0000-0000-0000-0000000000e2', 'ts مفصول بسلفة كبيرة', 'TS-B', '2024-01-01', '7812', 'd8000000-0000-0000-0000-0000000000d1', 'd8000000-0000-0000-0000-0000000000e9'),
  ('d8000000-0000-0000-0000-0000000000e3', 'ts مستمر', 'TS-C', '2024-01-01', '7813', 'd8000000-0000-0000-0000-0000000000d1', 'd8000000-0000-0000-0000-0000000000e9') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('d8000000-0000-0000-0000-0000000000a1', 'ts شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select e, 'd8000000-0000-0000-0000-0000000000a1', '2024-01-01' from unnest(array['d8000000-0000-0000-0000-0000000000e1','d8000000-0000-0000-0000-0000000000e2','d8000000-0000-0000-0000-0000000000e3','d8000000-0000-0000-0000-0000000000e9']::uuid[]) e on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('d8000000-0000-0000-0000-0000000000d9', 'TS-DEV-1', 'ts جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.ts_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- بصمات الشهر الماضي: الجميع 08:00–16:00 كل الأيام
do $$ declare m date := current_setting('test.ts_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; i int; n int; p text; begin
  for i in 0..dim - 1 loop
    foreach p in array array['7811','7812','7813','7809'] loop
      n := public.biometric_ingest('TS-DEV-1', p || E'\t' || (m + i)::text || E' 08:00:00\t0\n' || p || E'\t' || (m + i)::text || E' 16:00:00\t1', 'ATTLOG');
    end loop;
  end loop;
  perform app.hr_evaluate_month(m);
end $$;
select auth.set_test_user('d8000000-0000-0000-0000-000000000007');
select public.finance_salary_set('d8000000-0000-0000-0000-0000000000e1', 'monthly', 900000, 0, '{}', '{}', null);
select public.finance_salary_set('d8000000-0000-0000-0000-0000000000e2', 'monthly', 300000, 0, '{}', '{}', null);
select public.finance_salary_set('d8000000-0000-0000-0000-0000000000e3', 'monthly', 600000, 0, '{}', '{}', null);
select public.finance_salary_set('d8000000-0000-0000-0000-0000000000e9', 'monthly', 700000, 0, '{}', '{}', null);
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;
reset role; select set_config('auth.user_id','', false);

-- سلف مسلَّمة: A ⇒ 200,000 سُدّد منها 50,000 (المتبقي 150,000) · B ⇒ 2,000,000 بلا تسديد (أكبر من مستحقاته)
insert into public.advances (id, ref_no, employee_id, employee_name, employee_number, type_id, type_name, amount, requested_amount, repayment_method, installments, status, requested_by, delivered_at, repaid_total)
select 'd8000000-0000-0000-0000-0000000000f1', 'TS-ADV-1', 'd8000000-0000-0000-0000-0000000000e1', 'ts مستقيل شهري', 'TS-A', t.id, t.name, 200000, 200000, 'equal', 4, 'delivered', 'd8000000-0000-0000-0000-000000000001', now() - interval '40 days', 50000
from public.advance_types t where t.name = 'سلفة نقدية عادية' on conflict (id) do nothing;
insert into public.advances (id, ref_no, employee_id, employee_name, employee_number, type_id, type_name, amount, requested_amount, repayment_method, installments, status, requested_by, delivered_at, repaid_total)
select 'd8000000-0000-0000-0000-0000000000f2', 'TS-ADV-2', 'd8000000-0000-0000-0000-0000000000e2', 'ts مفصول بسلفة كبيرة', 'TS-B', t.id, t.name, 2000000, 2000000, 'equal', 12, 'delivered', 'd8000000-0000-0000-0000-000000000001', now() - interval '40 days', 0
from public.advance_types t where t.name = 'سلفة نقدية عادية' on conflict (id) do nothing;

-- ═══ T1 · قبل الإنهاء: الموظف ضمن فترة الكشف، ولا ملف تصفية ═══
do $$ declare m date := current_setting('test.ts_m')::date; begin
  assert exists (select 1 from app.hr_month_period(m) p where p.employee_id = 'd8000000-0000-0000-0000-0000000000e1' and p.full_month), 'T1 A in period before termination';
  assert (select count(*) from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e1') = 0, 'T1 no settlement yet';
  raise notice 'T1 ✅ لا ملف قبل الإنهاء';
end $$;

-- ═══ T2 · HR تنهي خدمة A (استقالة) في اليوم 15 ⇒ ملف تصفية تلقائي + تبليغ المدير المباشر + المالية ═══
select auth.set_test_user('d8000000-0000-0000-0000-000000000005');
select public.hr_employee_terminate('d8000000-0000-0000-0000-0000000000e1', 'resignation', (current_setting('test.ts_m')::date + 14), 'ظروف عائلية');
reset role; select set_config('auth.user_id','', false);
do $$ declare s public.hr_settlements; m date := current_setting('test.ts_m')::date; dim int := extract(day from (m + interval '1 month - 1 day'))::int; j jsonb; dr numeric; begin
  select * into s from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e1';
  assert found and s.status = 'pending' and s.termination_type = 'resignation' and s.last_day = m + 14 and s.salary_month = m and s.ref_no like 'ST-%', 'T2 settlement opened: ' || coalesce(s.status, 'none');
  assert s.manager_user_id = 'd8000000-0000-0000-0000-000000000008' and s.manager_name = 'ts المدير المباشر', 'T2 manager resolved: ' || coalesce(s.manager_name, 'null');
  assert exists (select 1 from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000008' and dedupe_key = 'settlement_mgr:' || s.id::text and title like '%ts مستقيل شهري%'), 'T2 manager notified';
  assert exists (select 1 from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000007' and title like 'تصفية نهاية خدمة جديدة%' and link = '/finance/settlements'), 'T2 finance notified';
  j := s.lines;
  dr := round(900000.0 / dim, 2);
  assert j -> 'salary' ->> 'source' = 'computed' and (j ->> 'has_profile')::boolean, 'T2 salary computed: ' || (j -> 'salary')::text;
  assert (j -> 'salary' ->> 'covered_days')::int = 15 and (j -> 'salary' ->> 'payable_days')::numeric = 15, 'T2 covered/payable 15: ' || (j -> 'salary')::text;
  assert abs((j -> 'salary' ->> 'day_rate')::numeric - dr) < 0.02, 'T2 day_rate = base/dim: ' || (j -> 'salary' ->> 'day_rate') || ' vs ' || dr;
  assert abs((j -> 'salary' ->> 'net')::numeric - round(dr * 15, 2)) < 1, 'T2 salary net = 15 days: ' || (j -> 'salary' ->> 'net');
  assert (j -> 'leave' ->> 'remaining_days')::numeric = 30 and abs((j -> 'leave' ->> 'amount')::numeric - round(30 * dr, 2)) < 1, 'T2 leave 30 days × day_rate: ' || (j -> 'leave')::text;
  assert (j ->> 'advances_total')::numeric = 150000 and jsonb_array_length(j -> 'advances') = 1 and (j -> 'advances' -> 0 ->> 'ref_no') = 'TS-ADV-1', 'T2 advances: ' || (j -> 'advances')::text;
  assert abs((j ->> 'net')::numeric - ((j -> 'salary' ->> 'net')::numeric + (j -> 'leave' ->> 'amount')::numeric - 150000)) < 0.01 and s.net_amount = (j ->> 'net')::numeric, 'T2 net formula';
  assert exists (select 1 from public.hr_settlement_events where settlement_id = s.id and action = 'opened'), 'T2 opened event';
  assert (select count(*) from public.hr_month_exports where version = -1) = 0 and (select count(*) from public.hr_month_export_rows r where r.employee_id = s.employee_id) = 0, 'T2 dry-run export removed';
  raise notice 'T2 ✅ ملف تلقائي + تبليغ المدير المباشر + بنود بنفس معادلة الكشف';
end $$;

-- ═══ T3 · الاستبعاد من كشف شهر الإنهاء: A لا يظهر في تصدير العمليات، C يظهر ═══
select auth.set_test_user('d8000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.ts_m')::date; x uuid; begin
  assert not exists (select 1 from app.hr_month_period(m) p where p.employee_id = 'd8000000-0000-0000-0000-0000000000e1'), 'T3 A excluded from period';
  x := public.ops_month_export(m);
  assert not exists (select 1 from public.hr_month_export_rows r where r.export_id = x and r.employee_id = 'd8000000-0000-0000-0000-0000000000e1'), 'T3 A must not be in sheet';
  assert exists (select 1 from public.hr_month_export_rows r where r.export_id = x and r.employee_id = 'd8000000-0000-0000-0000-0000000000e3'), 'T3 C in sheet';
  raise notice 'T3 ✅ لا ازدواج: المستقيل خارج كشف شهر الإنهاء';
end $$;
reset role; select set_config('auth.user_id','', false);

-- ═══ T4 · الصلاحيات: HR/المعاون لا يعتمدون؛ المالية فقط ═══
select auth.set_test_user('d8000000-0000-0000-0000-000000000005');
do $$ declare ok boolean := false; sid uuid := (select id from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e1'); begin
  begin perform public.finance_settlement_approve(sid, null); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%' or sqlerrm like '%PERMISSION_DENIED%'; end;
  assert ok, 'T4 hr forbidden';
  ok := false;
  begin perform public.finance_settlement_get(sid); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end;
  assert ok, 'T4 hr cannot read';
  assert (select count(*) from public.finance_settlements_list(null, null, 100)) = 0, 'T4 list empty for hr';
end $$;
select auth.set_test_user('d8000000-0000-0000-0000-000000000003');
do $$ declare ok boolean := false; sid uuid := (select id from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e1'); begin
  begin perform public.finance_settlement_approve(sid, null); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%' or sqlerrm like '%PERMISSION_DENIED%'; end;
  assert ok, 'T4 deputy forbidden';
  raise notice 'T4 ✅ المالية فقط';
end $$;

-- ═══ T5 · المالية: القائمة والملخص، إعادة الاحتساب، التسليم قبل الاعتماد مرفوض، الاعتماد يجمّد، التسليم يقفل السلفة ═══
select auth.set_test_user('d8000000-0000-0000-0000-000000000007');
do $$ declare sid uuid := (select id from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e1'); j jsonb; ok boolean := false; r record; a public.advances; begin
  select * into r from public.finance_settlements_list('open', 'TS-A', 100);
  assert r.status = 'pending' and r.status_label = 'بانتظار الاعتماد' and r.termination_label is not null and r.has_profile, 'T5 list row: ' || coalesce(r.status, 'none');
  j := public.finance_settlements_summary();
  assert (j ->> 'pending')::int >= 1, 'T5 summary pending';
  j := public.finance_settlement_recompute(sid);
  assert (j -> 'lines' ->> 'net')::numeric = (j ->> 'net_amount')::numeric and exists (select 1 from public.hr_settlement_events where settlement_id = sid and action = 'recomputed'), 'T5 recompute';
  begin perform public.finance_settlement_deliver(sid, null); exception when others then ok := sqlerrm like '%SETTLEMENT_NOT_APPROVED%'; end;
  assert ok, 'T5 deliver before approve must fail';
  j := public.finance_settlement_approve(sid, 'تمت المراجعة');
  assert j ->> 'status' = 'approved' and (j ->> 'net_amount')::numeric > 0 and (j ->> 'debt_amount')::numeric = 0, 'T5 approved: ' || (j ->> 'status');
  assert not exists (select 1 from public.finance_hr_notices n where n.employee_id = 'd8000000-0000-0000-0000-0000000000e1' and n.kind = 'termination_settlement' and not n.is_done), 'T5 old notice closed';
  ok := false;
  begin perform public.finance_settlement_recompute(sid); exception when others then ok := sqlerrm like '%SETTLEMENT_FROZEN%'; end;
  assert ok, 'T5 frozen after approve';
  j := public.finance_settlement_deliver(sid, 'سُلّم نقداً');
  assert j ->> 'status' = 'delivered' and j ->> 'delivery_note' = 'سُلّم نقداً', 'T5 delivered';
  select * into a from public.advances where id = 'd8000000-0000-0000-0000-0000000000f1';
  assert a.status = 'settled' and a.repaid_total = 200000, 'T5 advance closed: ' || a.status || '/' || a.repaid_total;
  assert exists (select 1 from public.advance_installments i where i.advance_id = a.id and i.source = 'cash' and i.amount = 150000), 'T5 cash installment 150000';
  assert exists (select 1 from public.advance_events v where v.advance_id = a.id and v.action = 'settlement_closed'), 'T5 advance event';
  assert (select count(*) from public.hr_settlement_events where settlement_id = sid and action in ('opened','recomputed','approved','delivered')) = 4, 'T5 events';
  select * into r from public.finance_settlements_list('closed', null, 100) where employee_number = 'TS-A';
  assert r.status = 'delivered', 'T5 closed filter';
  raise notice 'T5 ✅ اعتماد → تسليم → إقفال السلفة';
end $$;

-- ═══ T6 · B: فصل في اليوم 10 بسلفة 2,000,000 ⇒ صافٍ سالب ⇒ ذمة؛ الإعفاء يحتاج سبباً؛ التسديد يقفل السلفة ═══
select auth.set_test_user('d8000000-0000-0000-0000-000000000005');
select public.hr_employee_terminate('d8000000-0000-0000-0000-0000000000e2', 'dismissal', (current_setting('test.ts_m')::date + 9), 'مخالفات متكررة');
select auth.set_test_user('d8000000-0000-0000-0000-000000000007');
do $$ declare sid uuid := (select id from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e2'); j jsonb; ok boolean := false; a public.advances; begin
  assert sid is not null, 'T6 settlement for B';
  j := public.finance_settlement_approve(sid, null);
  assert j ->> 'status' = 'debt_open' and (j ->> 'net_amount')::numeric < 0 and (j ->> 'debt_amount')::numeric = -(j ->> 'net_amount')::numeric, 'T6 debt: ' || (j ->> 'status') || ' ' || (j ->> 'net_amount');
  assert (j -> 'lines' -> 'salary' ->> 'covered_days')::int = 10, 'T6 covered 10';
  begin perform public.finance_settlement_deliver(sid, null); exception when others then ok := sqlerrm like '%SETTLEMENT_NOT_APPROVED%'; end;
  assert ok, 'T6 deliver not allowed for debt';
  ok := false;
  begin perform public.finance_settlement_debt_close(sid, 'waived', ''); exception when others then ok := sqlerrm like '%SETTLEMENT_REASON_REQUIRED%'; end;
  assert ok, 'T6 waive requires reason';
  ok := false;
  begin perform public.finance_settlement_debt_close(sid, 'other', 'x'); exception when others then ok := sqlerrm like '%SETTLEMENT_DEBT_MODE_INVALID%'; end;
  assert ok, 'T6 invalid mode';
  j := public.finance_settlement_debt_close(sid, 'paid', 'سدّد المبلغ كاملاً');
  assert j ->> 'status' = 'debt_paid' and j ->> 'debt_note' = 'سدّد المبلغ كاملاً', 'T6 debt paid';
  select * into a from public.advances where id = 'd8000000-0000-0000-0000-0000000000f2';
  assert a.status = 'settled' and a.repaid_total = 2000000, 'T6 advance settled';
  assert exists (select 1 from public.advance_installments i where i.advance_id = a.id and i.source = 'cash' and i.amount = 2000000), 'T6 cash installment';
  ok := false;
  begin perform public.finance_settlement_debt_close(sid, 'paid', 'x'); exception when others then ok := sqlerrm like '%SETTLEMENT_NOT_DEBT%'; end;
  assert ok, 'T6 cannot close twice';
  j := public.finance_settlements_summary();
  assert (j ->> 'closed')::int = 2 and (j ->> 'debt_open')::int = 0, 'T6 summary: ' || j::text;
  raise notice 'T6 ✅ الذمة السالبة: تسديد يقفل السلفة، الإعفاء بسبب';
end $$;

-- ═══ T7 · الإعفاء: موظف ثالث بسلفة أكبر ⇒ إعفاء بسبب يقفل السلفة دون قسط نقدي ═══
reset role; select set_config('auth.user_id','', false);
insert into public.employees (id, full_name, employee_number, hire_date, department_id) values ('d8000000-0000-0000-0000-0000000000e4', 'ts معفى', 'TS-D', '2024-01-01', 'd8000000-0000-0000-0000-0000000000d1') on conflict (id) do nothing;
insert into public.advances (id, ref_no, employee_id, employee_name, employee_number, type_id, type_name, amount, requested_amount, repayment_method, installments, status, requested_by, delivered_at, repaid_total)
select 'd8000000-0000-0000-0000-0000000000f4', 'TS-ADV-4', 'd8000000-0000-0000-0000-0000000000e4', 'ts معفى', 'TS-D', t.id, t.name, 5000000, 5000000, 'equal', 12, 'delivered', 'd8000000-0000-0000-0000-000000000001', now() - interval '10 days', 0
from public.advance_types t where t.name = 'سلفة نقدية عادية' on conflict (id) do nothing;
select auth.set_test_user('d8000000-0000-0000-0000-000000000007');
select public.finance_salary_set('d8000000-0000-0000-0000-0000000000e4', 'monthly', 400000, 0, '{}', '{}', null);
select auth.set_test_user('d8000000-0000-0000-0000-000000000005');
select public.hr_employee_terminate('d8000000-0000-0000-0000-0000000000e4', 'contract_end', (current_setting('test.ts_m')::date + 20), 'انتهاء العقد');
select auth.set_test_user('d8000000-0000-0000-0000-000000000007');
do $$ declare sid uuid := (select id from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e4'); j jsonb; a public.advances; begin
  j := public.finance_settlement_approve(sid, null);
  assert j ->> 'status' = 'debt_open', 'T7 debt open';
  j := public.finance_settlement_debt_close(sid, 'waived', 'قرار المدير المفوض بالإعفاء');
  assert j ->> 'status' = 'debt_waived', 'T7 waived';
  select * into a from public.advances where id = 'd8000000-0000-0000-0000-0000000000f4';
  assert a.status = 'settled' and a.repaid_total = 0 and not exists (select 1 from public.advance_installments i where i.advance_id = a.id), 'T7 advance closed without cash installment';
  assert exists (select 1 from public.advance_events v where v.advance_id = a.id and v.action = 'settlement_waived'), 'T7 waived event';
  raise notice 'T7 ✅ الإعفاء بسبب';
end $$;

-- ═══ T8 · بلا ملف راتب ⇒ لا اعتماد (رسالة واضحة) ═══
reset role; select set_config('auth.user_id','', false);
insert into public.employees (id, full_name, employee_number, hire_date, department_id) values ('d8000000-0000-0000-0000-0000000000e5', 'ts بلا راتب', 'TS-E', '2024-01-01', 'd8000000-0000-0000-0000-0000000000d1') on conflict (id) do nothing;
select auth.set_test_user('d8000000-0000-0000-0000-000000000005');
select public.hr_employee_terminate('d8000000-0000-0000-0000-0000000000e5', 'retirement', (current_setting('test.ts_m')::date + 5), 'تقاعد');
select auth.set_test_user('d8000000-0000-0000-0000-000000000007');
do $$ declare sid uuid := (select id from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e5'); ok boolean := false; r record; begin
  select * into r from public.finance_settlements_list(null, 'TS-E', 10);
  assert r.status = 'pending' and not r.has_profile, 'T8 pending without profile';
  begin perform public.finance_settlement_approve(sid, null); exception when others then ok := sqlerrm like '%SETTLEMENT_NO_SALARY_PROFILE%'; end;
  assert ok, 'T8 approve blocked';
  raise notice 'T8 ✅ بلا ملف راتب ⇒ لا اعتماد';
end $$;

-- ═══ T9 · الإنهاء عبر الإجراءات (طلب + تنفيذ) يفتح الملف أيضاً — نفس المشغّل ═══
reset role; select set_config('auth.user_id','', false);
insert into public.employees (id, full_name, employee_number, hire_date, department_id) values ('d8000000-0000-0000-0000-0000000000e6', 'ts عبر الإجراءات', 'TS-F', '2024-01-01', 'd8000000-0000-0000-0000-0000000000d1') on conflict (id) do nothing;
update public.employees set employment_status = 'terminated', terminated_at = current_setting('test.ts_m')::date + 3, termination_type = 'death', termination_reason = 'وفاة' where id = 'd8000000-0000-0000-0000-0000000000e6';
do $$ begin
  assert exists (select 1 from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e6' and status = 'pending' and termination_type = 'death'), 'T9 trigger on any termination path';
  -- تكرار التحديث لا يفتح ملفاً ثانياً
  update public.employees set updated_at = now() where id = 'd8000000-0000-0000-0000-0000000000e6';
  assert (select count(*) from public.hr_settlements where employee_id = 'd8000000-0000-0000-0000-0000000000e6') = 1, 'T9 single file';
  raise notice 'T9 ✅ المشغّل يغطي كل مسارات الإنهاء';
end $$;

-- ═══ T10 · كتالوج الاحتفاظ يشمل الجدولين ═══
do $$ begin
  assert (select count(*) from app.data_retention_catalog() c where c.table_name in ('hr_settlements', 'hr_settlement_events')) = 2, 'T10 retention catalog';
  assert exists (select 1 from public.permission_units where key = 'finance.settlements'), 'T10 permission unit';
  raise notice 'T10 ✅ الاحتفاظ والصلاحيات';
end $$;
