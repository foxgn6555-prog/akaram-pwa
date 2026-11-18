-- مسار صرف رواتب الموظفين (20261117130000 + 20261117140000 + 20261117160000):
--   إقفال الكشف من المالية ⇒ طلب صرف يصل المدير المفوض ⇒ قراره ⇒ صرف المالية من القاصة (حركة واحدة نهائية) — أو رفض بسبب ثم إعادة إرسال.
-- معاملة كاملة تُرجَع في النهاية: لا تترك مستخدمين ولا كشوفاً ولا طلبات ولا حركات قاصة. بادئة pd. مستقل.
--   ① القيد وملخص القاصة · ② إنشاء الطلب عند الإقفال (وسلوك المحفِّز) · ③ القراءة والمرشّحات · ④ القرار · ⑤ الصرف ونقص الرصيد
--   ⑥ الرفض وإعادة الإرسال · ⑦ حارس التكرار ومسار الصلاحيات · ⑧ RLS والامتيازات · ⑨ قيود الجدول · ⑩ المسار الحقيقي من التصدير حتى الصرف
--   ⑪ إصلاح الحارس المتداخل في اعتماد الكشف (20261117170000): PD13، PD13b، PD13c
begin;
set client_min_messages = notice;
select set_config('app.dedup_window_seconds', '0', true);

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('auth.user_id', p::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
-- رصيد القاصة = قيمة محدَّدة (قبض أو مصروف بالفرق) فلا يتأثر الاختبار بما في القاعدة من حركات
create or replace function pg_temp.set_balance(p numeric) returns void language plpgsql as $$
declare cur numeric := app.treasury_balance();
begin
  if p > cur then
    insert into public.treasury_transactions (ref_no, kind, amount, type_name, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at)
    values ('TR-PDSEED-' || gen_random_uuid()::text, 'receipt', p - cur, 'pd تمويل', 'confirmed', true, 'c1d00000-0000-4000-8000-000000000002', 'pd', 'c1d00000-0000-4000-8000-000000000002', now());
  elsif p < cur then
    insert into public.treasury_transactions (ref_no, kind, amount, type_name, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at)
    values ('TR-PDSEED-' || gen_random_uuid()::text, 'expense', cur - p, 'pd مصروف', 'confirmed', true, 'c1d00000-0000-4000-8000-000000000002', 'pd', 'c1d00000-0000-4000-8000-000000000002', now());
  end if;
end $$;
-- كشف شهري بصفوف (يُنشأ لكل صف موظف حقيقي): p_rows مصفوفة JSON بأعمدة الصف؛ يُعاد معرّف الكشف (الحالة exported؛ الإقفال بتحديثها إلى approved)
create or replace function pg_temp.add_export(p_month date, p_version int, p_rows jsonb, p_by uuid) returns uuid language plpgsql as $$
declare x uuid; r jsonb; e uuid;
begin
  insert into public.hr_month_exports (period_month, version, status, review_status, exported_by) values (p_month, p_version, 'exported', 'approved', p_by) returning id into x;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into e from public.employees where employee_number = r ->> 'employee_number';
    if e is null then
      insert into public.employees (employee_number, full_name, hire_date) values (r ->> 'employee_number', coalesce(r ->> 'full_name', r ->> 'employee_number'), '2024-01-01') returning id into e;
    end if;
    insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, branch_name, department_name, job_title, pay_type, gross_amount, deductions_total, advance_installment, proposed_net, final_net)
    values (x, e, r ->> 'employee_number', r ->> 'full_name', r ->> 'branch_name', r ->> 'department_name', r ->> 'job_title', r ->> 'pay_type',
            (r ->> 'gross_amount')::numeric, (r ->> 'deductions_total')::numeric, coalesce((r ->> 'advance_installment')::numeric, 0), (r ->> 'proposed_net')::numeric, (r ->> 'final_net')::numeric);
  end loop;
  return x;
end $$;
create or replace function pg_temp.close_export(p_id uuid, p_by uuid) returns void language sql as $$
  update public.hr_month_exports set status = 'approved', approved_by = p_by, approved_at = now() where id = p_id
$$;

-- (أشهر الكشوف المُدخلة مباشرة في سنتَي 2040/2041 كي لا تتقاطع مع قفل أي شهر حقيقي؛ المسار الحقيقي PD12 يستعمل شهراً سابقاً للحاضر)
-- ═══ بيانات: المدير المفوض + محاسبان + غرفة العمليات + معاون + موظف عادي + مسؤول تطوير ═══
insert into auth.users (id, email) values
  ('c1d00000-0000-4000-8000-000000000001', 'pd-md@t.iq'), ('c1d00000-0000-4000-8000-000000000002', 'pd-f1@t.iq'), ('c1d00000-0000-4000-8000-000000000003', 'pd-f2@t.iq'),
  ('c1d00000-0000-4000-8000-000000000004', 'pd-ops@t.iq'), ('c1d00000-0000-4000-8000-000000000005', 'pd-dep@t.iq'), ('c1d00000-0000-4000-8000-000000000006', 'pd-emp@t.iq'),
  ('c1d00000-0000-4000-8000-000000000007', 'pd-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('c1d00000-0000-4000-8000-000000000001', 'super_admin'), ('c1d00000-0000-4000-8000-000000000002', 'finance_officer'), ('c1d00000-0000-4000-8000-000000000003', 'finance_officer'),
  ('c1d00000-0000-4000-8000-000000000004', 'ops_room'), ('c1d00000-0000-4000-8000-000000000005', 'deputy_director'), ('c1d00000-0000-4000-8000-000000000006', 'employee'),
  ('c1d00000-0000-4000-8000-000000000007', 'it_admin')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('c1d00000-0000-4000-8000-0000000000a1', 'c1d00000-0000-4000-8000-000000000001', 'PD-MD', 'المدير المفوض pd', '2024-01-01'),
  ('c1d00000-0000-4000-8000-0000000000a2', 'c1d00000-0000-4000-8000-000000000002', 'PD-F1', 'محاسب أول pd', '2024-01-01'),
  ('c1d00000-0000-4000-8000-0000000000a3', 'c1d00000-0000-4000-8000-000000000003', 'PD-F2', 'محاسب ثانٍ pd', '2024-01-01')
on conflict (id) do nothing;

-- ═══ PD1 · القيد وملخص القاصة ═══
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
do $$ declare s0 jsonb; s jsonb; k text; begin
  insert into public.treasury_transactions (ref_no, kind, amount, status, created_by) values ('PD-X1', 'payroll', 1, 'confirmed', 'c1d00000-0000-4000-8000-000000000002'), ('PD-X2', 'contractor_wages', 1, 'confirmed', 'c1d00000-0000-4000-8000-000000000002');
  assert (select count(*) from public.treasury_transactions where ref_no in ('PD-X1', 'PD-X2')) = 2, 'PD1 kinds accepted';
  delete from public.treasury_transactions where ref_no in ('PD-X1', 'PD-X2');
  perform pg_temp.expect_error($q$ insert into public.treasury_transactions (ref_no, kind, amount, status, created_by) values ('PD-X3', 'bogus', 1, 'confirmed', 'c1d00000-0000-4000-8000-000000000002') $q$, 'treasury_transactions_kind_check');
  perform pg_temp.set_balance(2000000);
  s0 := public.treasury_summary();
  foreach k in array array['balance', 'frozen', 'pending_out', 'pending_count', 'range', 'by_type', 'expenses_by_type', 'rewards_by_type', 'by_month'] loop
    assert s0 ? k, 'PD1 summary keeps the old key ' || k;
  end loop;
  foreach k in array array['receipts_confirmed', 'receipts_pending', 'rewards_cash_confirmed', 'rewards_count', 'gps_confirmed', 'gps_pending', 'advances_confirmed', 'advance_repayments', 'expenses_confirmed', 'expenses_count', 'purchases_confirmed', 'purchases_pending', 'count'] loop
    assert s0 -> 'range' ? k, 'PD1 range keeps the old key ' || k;
  end loop;
  assert (s0 -> 'range' ->> 'payroll_confirmed')::numeric = 0 and (s0 -> 'range' ->> 'contractor_wages_confirmed')::numeric = 0
     and not exists (select 1 from jsonb_array_elements(s0 -> 'by_month') m where not (m ? 'payroll' and m ? 'contractor_wages')), 'PD1 summary gains the new kinds (zero before any payment)';
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error($q$ select public.treasury_summary() $q$, 'EXEC_FORBIDDEN');
  raise notice 'PD1 ✅ القيد والملخص';
end $$;

-- ═══ PD2 · إقفال الكشف يُنشئ طلباً واحداً بأرقام وأسطر مجمَّدة ═══
-- خمسة صفوف: عادي بسلفة واستقطاع، معدَّل بيد المالية، استقطاع يتجاوز الإجمالي (صافيه صفر)، بلا ملف راتب، بلا فرع/قسم
select set_config('test.pd_a', pg_temp.add_export('2040-11-01', 1, $j$[
  {"employee_number":"PD-0142","full_name":"أحمد حسن الجبوري","branch_name":"الكرادة","department_name":"قسم النظافة","job_title":"عامل","pay_type":"monthly","gross_amount":285000,"deductions_total":37000,"advance_installment":25000,"proposed_net":248000,"final_net":248000},
  {"employee_number":"PD-0187","full_name":"سارة علي الموسوي","branch_name":"الزعفرانية","department_name":"الإدارة","job_title":"محاسبة","pay_type":"monthly","gross_amount":410000,"deductions_total":0,"proposed_net":400000,"final_net":410000},
  {"employee_number":"PD-0203","full_name":"كرار محمد العبادي","branch_name":"الكرادة","department_name":"الصيانة","job_title":"فني","pay_type":"monthly","gross_amount":300000,"deductions_total":320000,"proposed_net":0,"final_net":0},
  {"employee_number":"PD-0204","full_name":"موظف بلا ملف راتب","branch_name":"الكرادة","department_name":"قسم النظافة","job_title":"عامل"},
  {"employee_number":"PD-0300","full_name":"منى كاظم","job_title":"مشرفة","pay_type":"monthly","gross_amount":500000,"deductions_total":0,"proposed_net":500000,"final_net":500000}]$j$::jsonb,
  'c1d00000-0000-4000-8000-000000000002')::text, false);
do $$ declare x uuid := current_setting('test.pd_a')::uuid; a public.payroll_disbursements; l record; begin
  assert (select count(*) from public.payroll_disbursements) = 0, 'PD2 no request before the export is closed';
  perform pg_temp.close_export(x, 'c1d00000-0000-4000-8000-000000000002');
  assert (select count(*) from public.payroll_disbursements where source_export_id = x) = 1, 'PD2 closing created exactly one request';
  select * into a from public.payroll_disbursements where source_export_id = x;
  perform set_config('test.pd_req_a', a.id::text, false);
  assert a.kind = 'employee_payroll' and a.status = 'pending_approval' and a.version = 1 and a.period_month = '2040-11-01', 'PD2 type/state/version';
  assert a.net_total = 1158000 and a.gross_total = 1495000 and a.deductions_total = 357000 and a.people_count = 5 and a.payable_count = 3, 'PD2 frozen numbers: ' || row_to_json(a)::text;
  assert a.request_no ~ '^DSB-[0-9]{4}-[0-9]{4}$' and a.requested_by = 'c1d00000-0000-4000-8000-000000000002' and a.prev_net_total is null, 'PD2 meta: ' || row_to_json(a)::text;
  assert (select count(*) from public.payroll_disbursement_lines where disbursement_id = a.id) = 5 and (select sum(net_amount) from public.payroll_disbursement_lines where disbursement_id = a.id) = 1158000, 'PD2 lines';
  select * into l from public.payroll_disbursement_lines where disbursement_id = a.id and person_number = 'PD-0142';
  assert l.has_deduction and l.has_advance and not l.adjusted and l.net_amount = 248000 and l.group_name = 'الكرادة' and l.sub_group_name = 'قسم النظافة', 'PD2 line flags 0142: ' || row_to_json(l)::text;
  assert (select adjusted and not has_deduction from public.payroll_disbursement_lines where disbursement_id = a.id and person_number = 'PD-0187'), 'PD2 adjusted by finance';
  assert (select net_amount = 0 and has_deduction from public.payroll_disbursement_lines where disbursement_id = a.id and person_number = 'PD-0203'), 'PD2 over-deducted line is zero';
  assert (select net_amount = 0 and (details ->> 'no_profile')::boolean from public.payroll_disbursement_lines where disbursement_id = a.id and person_number = 'PD-0204'), 'PD2 no salary profile';
  assert (select group_name = 'بلا فرع' and sub_group_name = 'بلا قسم' from public.payroll_disbursement_lines where disbursement_id = a.id and person_number = 'PD-0300'), 'PD2 defaults for missing branch/department';
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = a.id and event = 'created') = 1, 'PD2 created event';
  assert (select count(*) from public.notifications where user_id = 'c1d00000-0000-4000-8000-000000000001' and dedupe_key = 'disb_created:' || a.id and link = '/admin/disbursements/' || a.id) = 1
     and (select count(*) from public.notifications where user_id in ('c1d00000-0000-4000-8000-000000000002', 'c1d00000-0000-4000-8000-000000000003') and dedupe_key = 'disb_created:' || a.id) = 0, 'PD2 only the MD is notified';
  assert (select count(*) from public.treasury_transactions where kind = 'payroll') = 0 and app.treasury_balance() = 2000000, 'PD2 closing moves no money';
  raise notice 'PD2 ✅ الإقفال ⇒ طلب بأرقام وأسطر مجمَّدة وإشعار للمدير المفوض فقط';
end $$;

-- ═══ PD3 · المحفِّز لا يُطلَق إلا عند التحوّل إلى approved ═══
do $$ declare x uuid := current_setting('test.pd_a')::uuid; d2 uuid; z uuid; ng uuid; tmp uuid; begin
  update public.hr_month_exports set rows_count = 5 where id = x;
  update public.hr_month_exports set status = 'approved' where id = x;
  assert (select count(*) from public.payroll_disbursements) = 1, 'PD3 unrelated updates neither fail nor create requests';
  -- كشف ثانٍ لشهر له طلب فعّال: يُرفض الإقفال كله بوضوح ويبقى الكشف exported
  d2 := pg_temp.add_export('2040-11-01', 2, '[{"employee_number":"PD-0142","full_name":"أحمد","pay_type":"monthly","gross_amount":1,"deductions_total":0,"proposed_net":1,"final_net":1}]'::jsonb, 'c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('update public.hr_month_exports set status = %L where id = %L', 'approved', d2), 'DISBURSEMENT_ACTIVE_EXISTS');
  assert (select status from public.hr_month_exports where id = d2) = 'exported', 'PD3 the rejected closing leaves the export open';
  delete from public.hr_month_exports where id = d2;
  -- كشف مجموعه صفر يُقفل بلا خطأ ولا طلب
  z := pg_temp.add_export('2040-10-01', 1, '[{"employee_number":"PD-Z1","full_name":"صفر","pay_type":"monthly","gross_amount":100,"deductions_total":100,"proposed_net":0,"final_net":0},{"employee_number":"PD-Z2","full_name":"بلا ملف"}]'::jsonb, 'c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.close_export(z, 'c1d00000-0000-4000-8000-000000000002');
  assert (select status from public.hr_month_exports where id = z) = 'approved' and (select count(*) from public.payroll_disbursements where source_export_id = z) = 0, 'PD3 zero total closes without a request';
  -- صافٍ سالب لا يُجمع (يُقصّ إلى صفر)
  ng := pg_temp.add_export('2040-09-01', 1, '[{"employee_number":"PD-N1","full_name":"سالب","pay_type":"monthly","gross_amount":10,"deductions_total":50,"proposed_net":-40,"final_net":-40},{"employee_number":"PD-N2","full_name":"موجب","pay_type":"monthly","gross_amount":500,"deductions_total":0,"proposed_net":500,"final_net":500}]'::jsonb, 'c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.close_export(ng, 'c1d00000-0000-4000-8000-000000000002');
  assert (select net_total = 500 and payable_count = 1 and people_count = 2 from public.payroll_disbursements where source_export_id = ng), 'PD3 negative net is clamped to zero, not subtracted';
  assert (select sum(net_amount) from public.payroll_disbursement_lines l join public.payroll_disbursements d on d.id = l.disbursement_id where d.source_export_id = ng) = 500, 'PD3 clamped lines sum to the request';
  -- الكشف المؤقت لتسوية إنهاء الخدمة (version -1, superseded) يُنشأ ويُحذف بلا طلب ولا اعتراض
  insert into public.hr_month_exports (period_month, version, status) values ('2040-08-01', -1, 'superseded') returning id into tmp;
  delete from public.hr_month_exports where id = tmp;
  assert (select count(*) from public.payroll_disbursements where period_month = '2040-08-01') = 0, 'PD3 the temporary settlement export creates nothing';
  raise notice 'PD3 ✅ سلوك المحفِّز';
end $$;

-- ═══ PD4 · القراءة والمرشّحات ═══
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
do $$ declare j jsonb; a uuid := current_setting('test.pd_req_a')::uuid; ln jsonb; g jsonb; no text; begin
  j := public.disbursement_list();
  assert jsonb_array_length(j -> 'items') = 2 and (j -> 'counts' ->> 'pending_approval')::int = 2 and (j ->> 'balance')::numeric = 2000000, 'PD4 list counts: ' || (j -> 'counts')::text;
  assert not exists (select 1 from jsonb_array_elements(j -> 'items') i where not (i ? 'kind_label' and i ? 'requested_by_name' and i ? 'other_adjustments') or i ->> 'kind_label' <> 'رواتب الموظفين'), 'PD4 items carry label and names';
  assert jsonb_array_length((public.disbursement_list(null, null, '2040-11-20') -> 'items')) = 1, 'PD4 month filter accepts any day of the month';
  perform pg_temp.expect_error($q$ select public.disbursement_list('x') $q$, 'DISBURSEMENT_FILTER_INVALID');
  select request_no into no from public.payroll_disbursements where id = a;
  assert jsonb_array_length((public.disbursement_list(null, null, null, lower(no)) -> 'items')) = 1, 'PD4 search by request number';
  -- التفاصيل: الرصيد بعد الصرف والنقص وعدّادات الشرائح ومجموعات الفرع/القسم
  g := public.disbursement_get(a);
  assert (g ->> 'balance')::numeric = 2000000 and (g ->> 'balance_after')::numeric = 842000 and (g ->> 'shortfall')::numeric = 0, 'PD4 get balance: ' || g::text;
  assert (g -> 'facets' -> 'flags' ->> 'all')::int = 5 and (g -> 'facets' -> 'flags' ->> 'deduction')::int = 2 and (g -> 'facets' -> 'flags' ->> 'adjusted')::int = 1 and (g -> 'facets' -> 'flags' ->> 'advance')::int = 1 and (g -> 'facets' -> 'flags' ->> 'zero')::int = 2, 'PD4 flag counts: ' || (g -> 'facets' -> 'flags')::text;
  assert exists (select 1 from jsonb_array_elements(g -> 'facets' -> 'groups') x where x ->> 'group' = 'الكرادة' and x ->> 'sub_group' = 'قسم النظافة' and (x ->> 'count')::int = 2 and (x ->> 'net')::numeric = 248000)
     and jsonb_array_length(g -> 'facets' -> 'groups') = 4, 'PD4 groups: ' || (g -> 'facets' -> 'groups')::text;
  -- الأسطر
  ln := public.disbursement_lines(a);
  assert (ln ->> 'total')::int = 5 and (ln ->> 'net_total')::numeric = 1158000 and (select string_agg(r ->> 'person_number', ',' order by ord) from jsonb_array_elements(ln -> 'rows') with ordinality t(r, ord)) = 'PD-0142,PD-0187,PD-0203,PD-0204,PD-0300', 'PD4 default lines';
  ln := public.disbursement_lines(a, 'الكرادة');
  assert (ln ->> 'total')::int = 3 and (ln ->> 'net_total')::numeric = 248000, 'PD4 branch filter';
  assert (public.disbursement_lines(a, 'الكرادة', 'قسم النظافة') ->> 'total')::int = 2, 'PD4 branch+department filter';
  assert (public.disbursement_lines(a, null, null, 'zero') ->> 'total')::int = 2 and (public.disbursement_lines(a, null, null, 'deduction') ->> 'total')::int = 2
     and (public.disbursement_lines(a, null, null, 'adjusted') ->> 'total')::int = 1 and (public.disbursement_lines(a, null, null, 'advance') ->> 'total')::int = 1, 'PD4 flags';
  assert (public.disbursement_lines(a, null, null, null, 'سارة') ->> 'total')::int = 1 and (public.disbursement_lines(a, null, null, null, 'pd-0203') ->> 'total')::int = 1 and (public.disbursement_lines(a, null, null, null, '%') ->> 'total')::int = 0, 'PD4 search by name/number, wildcards are literal';
  assert (public.disbursement_lines(a, null, null, null, null, 'net_desc') -> 'rows' -> 0 ->> 'person_number') = 'PD-0300' and (public.disbursement_lines(a, null, null, null, null, 'net_asc') -> 'rows' -> 0 ->> 'net_amount')::numeric = 0, 'PD4 sorting';
  ln := public.disbursement_lines(a, null, null, null, null, 'number', 2, 2);
  assert jsonb_array_length(ln -> 'rows') = 2 and ln -> 'rows' -> 0 ->> 'person_number' = 'PD-0203' and (ln ->> 'total')::int = 5 and (ln ->> 'offset')::int = 2, 'PD4 pagination';
  perform pg_temp.expect_error(format('select public.disbursement_lines(%L, null, null, %L)', a, 'zzz'), 'DISBURSEMENT_FILTER_INVALID');
  perform pg_temp.expect_error($q$ select public.disbursement_get('00000000-0000-4000-8000-00000000ffff') $q$, 'DISBURSEMENT_NOT_FOUND');
  -- من لا دور مالياً له: القائمة والتفاصيل والأسطر محجوبة، والعدّادات أصفار بلا خطأ
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error($q$ select public.disbursement_list() $q$, 'DISBURSEMENT_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.disbursement_get(%L)', a), 'DISBURSEMENT_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.disbursement_lines(%L)', a), 'DISBURSEMENT_FORBIDDEN');
  j := public.disbursement_counts();
  assert (j ->> 'pending_approval')::int = 0 and (j ->> 'approved')::int = 0 and (select count(*) from jsonb_object_keys(j)) = 2, 'PD4 counts for a non-finance user are zeros: ' || j::text;
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000007');
  perform pg_temp.expect_error($q$ select public.disbursement_list() $q$, 'DISBURSEMENT_FORBIDDEN');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  assert (public.disbursement_counts() ->> 'pending_approval')::int = 2, 'PD4 finance sees the pending count';
  raise notice 'PD4 ✅ القراءة والمرشّحات والصلاحيات';
end $$;

-- ═══ PD5 · القرار: المدير المفوض وحده، والاعتماد لا يحرّك القاصة ═══
do $$ declare a uuid := current_setting('test.pd_req_a')::uuid; j jsonb; begin
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true)', a), 'PERMISSION_DENIED');   -- المالية لا تقرر (بوابة الصلاحيات)
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000007');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true)', a), 'DISBURSEMENT_FORBIDDEN');   -- مسؤول التطوير يعبر البوابة والدالة ترفضه
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', a, '  '), 'DISBURSEMENT_REASON_REQUIRED');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', a, 'لا'), 'DISBURSEMENT_REASON_REQUIRED');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true)', '00000000-0000-4000-8000-00000000ffff'::uuid), 'DISBURSEMENT_NOT_FOUND');
  assert (select status from public.payroll_disbursements where id = a) = 'pending_approval', 'PD5 failed attempts change nothing';
  j := public.disbursement_decide(a, true);
  assert j ->> 'status' = 'approved' and (j ->> 'decided_by')::uuid = 'c1d00000-0000-4000-8000-000000000001' and j ->> 'decided_at' is not null, 'PD5 approved: ' || j::text;
  assert (select count(*) from public.treasury_transactions where kind = 'payroll') = 0 and app.treasury_balance() = 2000000, 'PD5 approval moves no money';
  assert (select count(*) from public.notifications where dedupe_key = 'disb_approved:' || a and user_id in ('c1d00000-0000-4000-8000-000000000002', 'c1d00000-0000-4000-8000-000000000003') and link = '/finance/disbursements/' || a) = 2
     and not exists (select 1 from public.notifications where dedupe_key = 'disb_approved:' || a and user_id = 'c1d00000-0000-4000-8000-000000000001'), 'PD5 finance notified with the payment-order link, MD not';
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', a, 'تراجع'), 'DISBURSEMENT_NOT_PENDING');
  raise notice 'PD5 ✅ القرار';
end $$;

-- ═══ PD6 · الصرف: حركة قاصة واحدة نهائية بالمبلغ المجمَّد بالضبط ═══
do $$ declare a uuid := current_setting('test.pd_req_a')::uuid; j jsonb; t public.treasury_transactions; b uuid; begin
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', a), 'PERMISSION_DENIED');
  -- طلب لم يُعتمد لا يُصرف
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000003');
  perform pg_temp.add_export('2040-12-01', 1, '[{"employee_number":"PD-B1","full_name":"ب","pay_type":"monthly","gross_amount":100000,"deductions_total":0,"proposed_net":100000,"final_net":100000}]'::jsonb, 'c1d00000-0000-4000-8000-000000000003');
  perform pg_temp.close_export((select id from public.hr_month_exports where period_month = '2040-12-01' and version = 1), 'c1d00000-0000-4000-8000-000000000003');
  select id into b from public.payroll_disbursements where period_month = '2040-12-01';
  perform set_config('test.pd_req_b', b::text, false);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', b), 'DISBURSEMENT_NOT_APPROVED');
  assert (select count(*) from public.treasury_transactions where kind = 'payroll') = 0, 'PD6 nothing written by a rejected payment';
  j := public.disbursement_pay(a, 'صرف نقدي');
  assert j ->> 'status' = 'paid' and (j ->> 'paid_by')::uuid = 'c1d00000-0000-4000-8000-000000000002' and j ->> 'treasury_tx_id' is not null and j ->> 'treasury_ref_no' is not null and j ->> 'paid_by_name' = 'محاسب أول pd', 'PD6 paid: ' || j::text;
  select * into t from public.treasury_transactions where id = (j ->> 'treasury_tx_id')::uuid;
  assert t.kind = 'payroll' and t.status = 'confirmed' and t.affects_balance and t.amount = 1158000 and t.confirmed_by = 'c1d00000-0000-4000-8000-000000000002' and t.created_by = 'c1d00000-0000-4000-8000-000000000002'
     and t.type_name = 'رواتب الموظفين' and t.finance_note = 'صرف نقدي', 'PD6 transaction: ' || row_to_json(t)::text;
  assert t.ref_no ~ '^TR-[0-9]{4}-[0-9]{5}$' and t.details like '%' || (j ->> 'request_no') || '%' and t.details like '%2040-11%', 'PD6 reference and details';
  assert app.treasury_balance() = 2000000 - 1158000, 'PD6 balance decreased by exactly the net';
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = a and event = 'paid') = 1
     and (select count(*) from public.notifications where user_id = 'c1d00000-0000-4000-8000-000000000001' and dedupe_key = 'disb_paid:' || a) = 1
     and (select count(*) from public.notifications where user_id = 'c1d00000-0000-4000-8000-000000000002' and dedupe_key = 'disb_paid:' || a) = 0, 'PD6 paid event; MD notified; the payer (who also sent it) is not notified of his own action';
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', a), 'DISBURSEMENT_ALREADY_PAID');
  assert (select count(*) from public.treasury_transactions where kind = 'payroll') = 1 and app.treasury_balance() = 842000, 'PD6 no second debit';
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  assert (public.treasury_summary() -> 'range' ->> 'payroll_confirmed')::numeric = 1158000 and exists (select 1 from jsonb_array_elements(public.treasury_summary() -> 'by_month') m where (m ->> 'payroll')::numeric = 1158000), 'PD6 treasury summary shows the payroll payment';
  raise notice 'PD6 ✅ الصرف';
end $$;

-- ═══ PD7 · نقص الرصيد: الرفض الكامل بلا أي أثر، ثم النجاح بعد التغطية ═══
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000003');
select set_config('test.pd_req_c', pg_temp.add_export('2041-01-01', 1, '[{"employee_number":"PD-C1","full_name":"كبير","pay_type":"monthly","gross_amount":1000000,"deductions_total":0,"proposed_net":1000000,"final_net":1000000}]'::jsonb, 'c1d00000-0000-4000-8000-000000000003')::text, false);
select pg_temp.close_export(current_setting('test.pd_req_c')::uuid, 'c1d00000-0000-4000-8000-000000000003');
select public.disbursement_decide((select id from public.payroll_disbursements where source_export_id = current_setting('test.pd_req_c')::uuid), true) is not null as approved from (select pg_temp.as_user('c1d00000-0000-4000-8000-000000000001')) x;
do $$ declare c uuid; ev0 int; tx0 int; seq0 bigint; bal0 numeric; g jsonb; j jsonb; n numeric; begin
  select id into c from public.payroll_disbursements where source_export_id = current_setting('test.pd_req_c')::uuid;
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  bal0 := app.treasury_balance(); ev0 := (select count(*) from public.payroll_disbursement_events where disbursement_id = c);
  tx0 := (select count(*) from public.treasury_transactions); seq0 := (select last_value from public.treasury_ref_seq);
  assert bal0 = 842000, 'PD7 setup balance';
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', c), 'TREASURY_INSUFFICIENT');
  assert (select status from public.payroll_disbursements where id = c) = 'approved' and (select count(*) from public.treasury_transactions) = tx0
     and (select count(*) from public.payroll_disbursement_events where disbursement_id = c) = ev0 and app.treasury_balance() = bal0, 'PD7 no trace of the failed payment';
  assert (select last_value from public.treasury_ref_seq) = seq0, 'PD7 no reference number was consumed (the whole transaction rolled back)';
  g := public.disbursement_get(c);
  assert (g ->> 'shortfall')::numeric = 158000 and (g ->> 'balance_after')::numeric < 0, 'PD7 details show the exact shortfall: ' || g::text;
  perform pg_temp.set_balance(842000 + 500000);
  j := public.disbursement_pay(c);
  assert j ->> 'status' = 'paid' and app.treasury_balance() = 842000 + 500000 - 1000000, 'PD7 paid after the balance was covered';
  assert (select count(*) from public.notifications where user_id = 'c1d00000-0000-4000-8000-000000000003' and dedupe_key = 'disb_paid:' || c and link = '/finance/disbursements/' || c) = 1, 'PD7 the accountant who sent it (not the payer) is notified with the finance link';
  -- بدينار واحد أقل: يُرفض؛ وبالمساواة بالضبط: ينجح
  perform pg_temp.set_balance(1158000 - 1 + 1000000);
  raise notice 'PD7 ✅ نقص الرصيد';
end $$;

-- ═══ PD8 · الرفض بسبب إلزامي ثم إعادة الإرسال بنسخة جديدة ═══
do $$ declare b uuid := current_setting('test.pd_req_b')::uuid; b2 jsonb; j jsonb; l jsonb; old jsonb; nw jsonb; begin
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  j := public.disbursement_decide(b, false, 'راجعوا الاستقطاعات');
  assert j ->> 'status' = 'rejected' and j ->> 'decision_note' = 'راجعوا الاستقطاعات' and (j ->> 'decided_by')::uuid = 'c1d00000-0000-4000-8000-000000000001', 'PD8 rejected: ' || j::text;
  assert (select count(*) from public.notifications where dedupe_key = 'disb_rejected:' || b and user_id in ('c1d00000-0000-4000-8000-000000000002', 'c1d00000-0000-4000-8000-000000000003') and body like '%السبب: راجعوا الاستقطاعات%') = 2, 'PD8 both accountants notified with the reason';
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', b), 'DISBURSEMENT_NOT_APPROVED');
  l := public.disbursement_list();
  select x into old from jsonb_array_elements(l -> 'items') x where x ->> 'id' = b::text;
  assert (l -> 'counts' ->> 'rejected')::int = 1 and (l -> 'counts' ->> 'rejected_open')::int = 1 and old -> 'resubmitted_id' = 'null'::jsonb and old -> 'resubmitted_version' = 'null'::jsonb, 'PD8 rejected awaiting resubmission: ' || (l -> 'counts')::text;
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true)', b), 'DISBURSEMENT_NOT_PENDING');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error(format('select public.disbursement_resubmit(%L)', b), 'PERMISSION_DENIED');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_resubmit(%L)', current_setting('test.pd_req_a')::uuid), 'DISBURSEMENT_NOT_REJECTED');
  b2 := public.disbursement_resubmit(b, 'عالجنا الاستقطاعات');
  assert (b2 ->> 'version')::int = 2 and b2 ->> 'status' = 'pending_approval' and (b2 ->> 'supersedes_id')::uuid = b and (b2 ->> 'requested_by')::uuid = 'c1d00000-0000-4000-8000-000000000002' and (b2 ->> 'net_total')::numeric = 100000, 'PD8 new version: ' || b2::text;
  l := public.disbursement_list();
  select x into old from jsonb_array_elements(l -> 'items') x where x ->> 'id' = b::text;
  select x into nw from jsonb_array_elements(l -> 'items') x where x ->> 'id' = b2 ->> 'id';
  assert (l -> 'counts' ->> 'rejected')::int = 1 and (l -> 'counts' ->> 'rejected_open')::int = 0 and old ->> 'resubmitted_id' = b2 ->> 'id' and old ->> 'resubmitted_no' = b2 ->> 'request_no' and (old ->> 'resubmitted_version')::int = 2 and nw -> 'resubmitted_id' = 'null'::jsonb, 'PD8 after resubmission: ' || (l -> 'counts')::text;
  assert (select count(*) from public.payroll_disbursement_lines where disbursement_id = (b2 ->> 'id')::uuid) = 1 and (select sum(net_amount) from public.payroll_disbursement_lines where disbursement_id = (b2 ->> 'id')::uuid) = 100000
     and (select status from public.payroll_disbursements where id = b) = 'rejected' and (select count(*) from public.payroll_disbursement_lines where disbursement_id = b) = 1, 'PD8 lines copied; the rejected version keeps its own';
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = b and event = 'resubmitted' and note = 'عالجنا الاستقطاعات') = 1 and (select count(*) from public.payroll_disbursement_events where disbursement_id = (b2 ->> 'id')::uuid and event = 'created') = 1, 'PD8 events';
  assert (select count(*) from public.notifications where user_id = 'c1d00000-0000-4000-8000-000000000001' and dedupe_key = 'disb_created:' || (b2 ->> 'id') and body like '%ملاحظة المالية: عالجنا الاستقطاعات%') = 1, 'PD8 MD notified of the new version with the finance note';
  perform pg_temp.expect_error(format('select public.disbursement_resubmit(%L)', b), 'DISBURSEMENT_ACTIVE_EXISTS');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  perform public.disbursement_decide((b2 ->> 'id')::uuid, true);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.set_balance(5000000);
  j := public.disbursement_pay((b2 ->> 'id')::uuid);
  assert j ->> 'status' = 'paid' and app.treasury_balance() = 5000000 - 100000, 'PD8 the second version is paid';
  raise notice 'PD8 ✅ الرفض وإعادة الإرسال';
end $$;

-- ═══ PD9 · حارس التكرار (النافذة 8 ثوانٍ) وبوابة الصلاحيات الدقيقة ═══
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000003');
select set_config('test.pd_req_d', pg_temp.add_export('2041-02-01', 1, '[{"employee_number":"PD-D1","full_name":"د","pay_type":"monthly","gross_amount":5000,"deductions_total":0,"proposed_net":5000,"final_net":5000}]'::jsonb, 'c1d00000-0000-4000-8000-000000000003')::text, false);
select pg_temp.close_export(current_setting('test.pd_req_d')::uuid, 'c1d00000-0000-4000-8000-000000000003');
do $$ declare d uuid; begin
  select id into d from public.payroll_disbursements where source_export_id = current_setting('test.pd_req_d')::uuid;
  perform set_config('app.dedup_window_seconds', '8', true);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  perform public.disbursement_decide(d, false, 'سبب مكرر');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', d, 'سبب مكرر'), 'DUPLICATE_SUBMIT');
  perform set_config('app.dedup_window_seconds', '0', true);
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', d, 'سبب مكرر'), 'DISBURSEMENT_NOT_PENDING');
  raise notice 'PD9a ✅ حارس التكرار';
end $$;
-- مسار الصلاحيات: سحب إجراء «الصرف» من محاسب بعينه يمنعه ولو كان محاسباً، وإعادته تُجيز
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000003');
select set_config('test.pd_req_e', pg_temp.add_export('2041-03-01', 1, '[{"employee_number":"PD-E1","full_name":"هـ","pay_type":"monthly","gross_amount":10000,"deductions_total":0,"proposed_net":10000,"final_net":10000}]'::jsonb, 'c1d00000-0000-4000-8000-000000000003')::text, false);
select pg_temp.close_export(current_setting('test.pd_req_e')::uuid, 'c1d00000-0000-4000-8000-000000000003');
do $$ declare e uuid; begin
  select id into e from public.payroll_disbursements where source_export_id = current_setting('test.pd_req_e')::uuid;
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  perform public.disbursement_decide(e, true);
  insert into public.user_permission_overrides (user_id, unit_key, action, effect) values ('c1d00000-0000-4000-8000-000000000002', 'finance.disbursements', 'execute', 'deny');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', e), 'PERMISSION_DENIED');
  assert (select status from public.payroll_disbursements where id = e) = 'approved', 'PD9 the denied accountant paid nothing';
  delete from public.user_permission_overrides where user_id = 'c1d00000-0000-4000-8000-000000000002' and unit_key = 'finance.disbursements';
  perform public.disbursement_pay(e);
  assert (select status from public.payroll_disbursements where id = e) = 'paid', 'PD9 allowed again after the override is removed';
  raise notice 'PD9b ✅ بوابة الصلاحيات';
end $$;

-- ═══ PD9c · الدفاع المتعمّق: بلا ربط الصلاحيات تفحص كل دالة الدور بنفسها ═══
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000003');
select set_config('test.pd_req_f', pg_temp.add_export('2041-04-01', 1, '[{"employee_number":"PD-F9","full_name":"و","pay_type":"monthly","gross_amount":7000,"deductions_total":0,"proposed_net":7000,"final_net":7000}]'::jsonb, 'c1d00000-0000-4000-8000-000000000003')::text, false);
select pg_temp.close_export(current_setting('test.pd_req_f')::uuid, 'c1d00000-0000-4000-8000-000000000003');
do $$ declare f uuid; saved jsonb; begin
  select id into f from public.payroll_disbursements where source_export_id = current_setting('test.pd_req_f')::uuid;
  select jsonb_agg(to_jsonb(b)) into saved from public.permission_write_bindings b where b.fn in ('disbursement_decide', 'disbursement_pay', 'disbursement_resubmit');
  assert jsonb_array_length(saved) = 3, 'PD9c the three bindings exist before the test';
  delete from public.permission_write_bindings where fn in ('disbursement_decide', 'disbursement_pay', 'disbursement_resubmit');
  -- المحاسب لا يقرر ولو سقطت البوابة، والموظف لا يصرف ولا يعيد الإرسال
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true)', f), 'DISBURSEMENT_FORBIDDEN');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', f), 'DISBURSEMENT_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.disbursement_resubmit(%L)', f), 'DISBURSEMENT_FORBIDDEN');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000007');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', f), 'DISBURSEMENT_FORBIDDEN');
  assert (select status from public.payroll_disbursements where id = f) = 'pending_approval', 'PD9c nothing changed';
  insert into public.permission_write_bindings (fn, unit_key, action) select b ->> 'fn', b ->> 'unit_key', b ->> 'action' from jsonb_array_elements(saved) b;
  assert (select count(*) from public.permission_write_bindings where fn in ('disbursement_decide', 'disbursement_pay', 'disbursement_resubmit')) = 3, 'PD9c bindings restored';
  raise notice 'PD9c ✅ الدفاع المتعمّق';
end $$;

-- ═══ PD10 · RLS والامتيازات ═══
do $$ declare nall int; nf int; ne int; msg text; begin
  assert not has_function_privilege('anon', 'public.disbursement_pay(uuid,text)', 'execute') and not has_function_privilege('anon', 'public.disbursement_list(text,text,date,text,int)', 'execute')
     and has_function_privilege('authenticated', 'public.disbursement_pay(uuid,text)', 'execute') and has_function_privilege('authenticated', 'public.disbursement_decide(uuid,boolean,text)', 'execute'), 'PD10 public function privileges';
  assert not has_function_privilege('authenticated', 'app.disbursement_pay__raw(uuid,text)', 'execute') and not has_function_privilege('authenticated', 'app.disbursement_open_payroll(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.disbursement_decide__raw(uuid,boolean,text)', 'execute'), 'PD10 internal functions are not callable by authenticated';
  select count(*) into nall from public.payroll_disbursements;
  set local role authenticated;
  perform set_config('auth.user_id', 'c1d00000-0000-4000-8000-000000000002', true); select count(*) into nf from public.payroll_disbursements;
  perform set_config('auth.user_id', 'c1d00000-0000-4000-8000-000000000006', true); select count(*) into ne from public.payroll_disbursements;
  assert nf = nall and nall >= 5 and ne = 0, 'PD10 RLS: finance sees all requests, an employee sees none (' || nf || '/' || nall || '/' || ne || ')';
  perform set_config('auth.user_id', 'c1d00000-0000-4000-8000-000000000002', true);
  begin insert into public.payroll_disbursements (request_no, kind, period_month, net_total) values ('PD-HACK', 'contractor_wages', '2030-01-01', 5); msg := null; exception when others then msg := sqlerrm; end;
  assert msg ~* 'permission denied|row-level security', 'PD10 direct insert denied: ' || coalesce(msg, 'allowed');
  begin update public.payroll_disbursements set status = 'paid'; msg := null; exception when others then msg := sqlerrm; end;
  assert msg ~* 'permission denied', 'PD10 direct update denied: ' || coalesce(msg, 'allowed');
  begin delete from public.payroll_disbursement_lines; msg := null; exception when others then msg := sqlerrm; end;
  assert msg ~* 'permission denied', 'PD10 direct delete denied: ' || coalesce(msg, 'allowed');
  reset role;
  set local role anon;
  begin perform count(*) from public.payroll_disbursements; msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  assert msg ~* 'permission denied', 'PD10 anon cannot read: ' || coalesce(msg, 'allowed');
  raise notice 'PD10 ✅ RLS والامتيازات';
end $$;

-- ═══ PD11 · قيود الجدول نفسه والتناسق الشامل ═══
do $$ declare x uuid := current_setting('test.pd_a')::uuid; msg text; d uuid; begin
  begin insert into public.payroll_disbursements (request_no, kind, period_month, version, status, source_export_id, net_total) values ('PD-DUP', 'employee_payroll', '2040-11-01', 9, 'pending_approval', x, 5); msg := null; exception when others then msg := sqlerrm; end;
  assert msg like '%payroll_disbursements_one_active%', 'PD11 one active request per type and month: ' || coalesce(msg, 'allowed');
  select id into d from public.payroll_disbursements where source_export_id = current_setting('test.pd_req_d')::uuid;
  begin update public.payroll_disbursements set status = 'paid', paid_at = now() where id = d; msg := null; exception when others then msg := sqlerrm; end;
  assert msg like '%payroll_disbursements_status_fields%', 'PD11 a request cannot be paid without a treasury transaction: ' || coalesce(msg, 'allowed');
  assert (select count(*) from public.payroll_disbursements q join public.treasury_transactions t on t.id = q.treasury_tx_id where q.status = 'paid' and t.amount <> q.net_total) = 0, 'PD11 every payment equals the frozen net';
  assert (select count(*) from public.payroll_disbursements q where (select coalesce(sum(net_amount), 0) from public.payroll_disbursement_lines l where l.disbursement_id = q.id) <> q.net_total) = 0, 'PD11 lines always sum to the request net';
  assert (select count(*) from public.treasury_transactions where kind = 'payroll') = (select count(*) from public.payroll_disbursements where status = 'paid' and kind = 'employee_payroll'), 'PD11 one payroll transaction per paid request';
  -- كتالوجا التصفير والاحتفاظ تعرفان الجداول الجديدة
  assert app.platform_reset_category_of('payroll_disbursements') = 'payroll' and app.platform_reset_category_of('payroll_disbursement_lines') = 'payroll' and app.platform_reset_category_of('payroll_disbursement_events') = 'payroll', 'PD11 reset catalog';
  assert (select count(*) from app.data_retention_catalog() where table_name like 'payroll_disbursement%' and not deletable and portal_key = 'finance') = 3, 'PD11 retention catalog locks the three tables';
  assert not exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name like 'payroll_disbursement%' and not exists (select 1 from app.data_retention_catalog() k where k.table_name = t.table_name)), 'PD11 every new table is registered in the retention catalog';
  -- كشف مرتبط بطلب لا يُحذف (مفتاح أجنبي)
  begin delete from public.hr_month_exports where id = x; msg := null; exception when others then msg := sqlerrm; end;
  assert msg ~* 'foreign key|violates', 'PD11 an export linked to a request cannot be deleted: ' || coalesce(msg, 'allowed');
  raise notice 'PD11 ✅ القيود والتناسق';
end $$;

-- ═══ PD12 · المسار الحقيقي كاملاً: التصدير من العمليات ⇒ اعتماد المعاون ⇒ اعتماد المالية ⇒ طلب ⇒ قرار ⇒ صرف ═══
-- (الحضورية غير مشروطة هنا: هذا الاختبار لا يختبر تأكيد الحضور بل ما بعد الاعتماد)
-- ونموذج «الراتب كاملاً ناقص الغياب» كي يكون صافي كل موظف بلا حضور مسجَّل هو راتبه (النموذج الافتراضي «الأيام المستحقة» يعطي صفراً بلا حضور)
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false, "salary_model": "full_minus_absence", "salary_day_basis": "fixed_30"}'::jsonb where id = 1;
create or replace function pg_temp.export_reviewed(p_month date) returns uuid language plpgsql as $$
declare x uuid;
begin
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000004');
  x := public.ops_month_export(p_month);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000005');
  perform public.deputy_payroll_approve(x);
  return x;
end $$;
-- كشف الموظفين يضم من له رقم بصمة فقط (app.hr_month_summary)
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
  ('c1d00000-0000-4000-8000-0000000000b1', 'PD-R1', 'موظف حقيقي أول', '2024-01-01', 'PDR1'), ('c1d00000-0000-4000-8000-0000000000b2', 'PD-R2', 'موظف حقيقي ثانٍ', '2024-01-01', 'PDR2')
on conflict (id) do nothing;
select pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
do $$ declare e record; begin
  perform public.finance_salary_set('c1d00000-0000-4000-8000-0000000000b1', 'monthly', 600000, 0, '{}', '{}', null);
  perform public.finance_salary_set('c1d00000-0000-4000-8000-0000000000b2', 'monthly', 450000, 0, '{}', '{}', null);
  -- كل موظف نشط آخر في القاعدة يحتاج ملف راتب كي يُصدَّر الكشف (كما تفعل بقية اختبارات الرواتب)
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;
do $$ declare m date := (date_trunc('month', current_date) - interval '2 months')::date; x uuid; a public.payroll_disbursements; net numeric; bal0 numeric; j jsonb; begin
  x := pg_temp.export_reviewed(m);
  assert (select count(*) from public.payroll_disbursements where source_export_id = x) = 0, 'PD12 exporting and the deputy review create no request yet';
  perform pg_temp.set_balance(900000000);
  bal0 := app.treasury_balance();
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform public.finance_payroll_approve(x, true);
  select * into a from public.payroll_disbursements where source_export_id = x;
  assert a.id is not null and a.kind = 'employee_payroll' and a.status = 'pending_approval' and a.version = 1 and a.period_month = m, 'PD12 finance approval created the request: ' || coalesce(row_to_json(a)::text, 'none');
  select coalesce(sum(greatest(0, coalesce(r.final_net, r.proposed_net, 0))), 0) into net from public.hr_month_export_rows r where r.export_id = x;
  assert a.net_total = net and net >= 600000 + 450000 and a.people_count = (select count(*) from public.hr_month_export_rows r where r.export_id = x), 'PD12 the request equals the approved export (' || a.net_total || ' vs ' || net || ')';
  assert (select count(*) from public.payroll_disbursement_lines where disbursement_id = a.id) = a.people_count and (select sum(net_amount) from public.payroll_disbursement_lines where disbursement_id = a.id) = a.net_total, 'PD12 lines mirror the export rows';
  assert app.treasury_balance() = bal0 and (select count(*) from public.treasury_transactions where kind = 'payroll' and details like '%' || a.request_no || '%') = 0, 'PD12 approving the payroll no longer needs (or moves) any money by itself';
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000001');
  perform public.disbursement_decide(a.id, true);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000003');
  j := public.disbursement_pay(a.id, 'صرف الشهر');
  assert j ->> 'status' = 'paid' and app.treasury_balance() = bal0 - net and (select amount from public.treasury_transactions where id = (j ->> 'treasury_tx_id')::uuid) = net, 'PD12 paid: the treasury decreased by the net of the approved export';
  raise notice 'PD12 ✅ المسار الحقيقي: كشف الرواتب ⇒ طلب ⇒ قرار ⇒ صرف (%)', net;
end $$;

-- ═══ PD13 · إصلاح الحارس المتداخل (20261117170000): المطابقة ثم الاعتماد فوراً داخل نافذة التكرار ═══
-- قبل الإصلاح: الاعتماد ينادي الغلاف المحروس public.finance_payroll_reconcile، فإن سبقته مطابقة للشهر نفسه (ما تفعله الواجهة عند فتح الكشف)
-- رفضه الحارس بـ DUPLICATE_SUBMIT بلا أي تغيير في الحالة؛ ويفرض عليه كذلك صلاحية execute بينما الاعتماد مربوط بـ decide.
-- رأس الملف يعطّل النافذة (0) لتتكرر النداءات في الاختبارات؛ هنا نفعّلها 8 ثوانٍ كما في الإنتاج.
do $$ declare m date := (date_trunc('month', current_date) - interval '3 months')::date; x uuid; a public.payroll_disbursements; n int; begin
  x := pg_temp.export_reviewed(m);
  perform set_config('app.dedup_window_seconds', '8', true);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  select count(*) into n from public.finance_payroll_reconcile(m);
  assert n >= 2, 'PD13 the reconcile call (what the UI does when the sheet opens) returns the sheet rows';
  perform pg_temp.expect_error(format('select count(*) from public.finance_payroll_reconcile(%L)', m), 'DUPLICATE_SUBMIT');
  perform public.finance_payroll_approve(x, true);
  select * into a from public.payroll_disbursements where source_export_id = x;
  assert (select status from public.hr_month_exports where id = x) = 'approved' and a.id is not null and a.status = 'pending_approval',
    'PD13 approving right after the reconcile call (inside the dedup window) closes the export and opens the request';
  perform pg_temp.expect_error(format('select public.finance_payroll_approve(%L::uuid, true)', x), 'DUPLICATE_SUBMIT');
  perform set_config('app.dedup_window_seconds', '0', true);
  raise notice 'PD13 ✅ الاعتماد بعد المطابقة مباشرة ينجح، وحارسا المطابقة والاعتماد الخارجيان باقيان';
end $$;

-- PD13b: محاسب مُنع عليه execute (override deny) يعتمد بصلاحية decide وحدها؛ والمطابقة المباشرة تبقى مشروطة بـ execute
do $$ declare m date := (date_trunc('month', current_date) - interval '4 months')::date; x uuid; a public.payroll_disbursements; begin
  x := pg_temp.export_reviewed(m);
  insert into public.user_permission_overrides (user_id, unit_key, action, effect, reason)
  values ('c1d00000-0000-4000-8000-000000000002', 'finance.payroll', 'execute', 'deny', 'pd13b');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select count(*) from public.finance_payroll_reconcile(%L)', m), 'PERMISSION_DENIED');
  perform public.finance_payroll_approve(x, true);
  select * into a from public.payroll_disbursements where source_export_id = x;
  assert a.id is not null and a.status = 'pending_approval', 'PD13b an approver with decide but not execute can approve (the nested call no longer demands execute)';
  delete from public.user_permission_overrides where reason = 'pd13b';
  -- وبالعكس: من فُقدت عنه decide لا يعتمد حتى لو ملك execute (الحارس الخارجي باقٍ)
  m := (date_trunc('month', current_date) - interval '5 months')::date;
  x := pg_temp.export_reviewed(m);
  insert into public.user_permission_overrides (user_id, unit_key, action, effect, reason)
  values ('c1d00000-0000-4000-8000-000000000002', 'finance.payroll', 'decide', 'deny', 'pd13b');
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.finance_payroll_approve(%L::uuid, true)', x), 'PERMISSION_DENIED');
  assert (select status from public.hr_month_exports where id = x) = 'exported' and not exists (select 1 from public.payroll_disbursements where source_export_id = x), 'PD13b denied decide ⇒ nothing changes';
  delete from public.user_permission_overrides where reason = 'pd13b';
  raise notice 'PD13b ✅ الاعتماد مربوط بـ decide وحدها، والمطابقة المباشرة بـ execute';
end $$;

-- PD13c: فحص تطابق الأرقام (ما يغذّيه النداء المُستبدَل) ما زال يوقف الاعتماد: صف مخزَّن غير مطابق للحي ⇒ HR_PAYROLL_RECONCILE_MISMATCH ولا يتغير شيء
do $$ declare m date := (date_trunc('month', current_date) - interval '7 months')::date; x uuid; a public.payroll_disbursements; ok_before boolean; begin
  x := pg_temp.export_reviewed(m);
  perform pg_temp.as_user('c1d00000-0000-4000-8000-000000000002');
  select bool_and(money_ok) into ok_before from public.finance_payroll_reconcile(m) rc where rc.row_id in (select id from public.hr_month_export_rows where export_id = x);
  assert ok_before, 'PD13c the untouched sheet reconciles';
  update public.hr_month_export_rows set gross_amount = gross_amount + 5000 where export_id = x and employee_number = 'PD-R2';
  assert exists (select 1 from public.finance_payroll_reconcile(m) rc where rc.row_id in (select id from public.hr_month_export_rows where export_id = x) and not rc.money_ok), 'PD13c test setup: the tampered row is reported as not matching';
  perform pg_temp.expect_error(format('select public.finance_payroll_approve(%L::uuid, true)', x), 'HR_PAYROLL_RECONCILE_MISMATCH');
  assert (select status from public.hr_month_exports where id = x) = 'exported' and not exists (select 1 from public.payroll_disbursements where source_export_id = x), 'PD13c a blocked approval changes nothing';
  raise notice 'PD13c ✅ عدم تطابق الأرقام يوقف الاعتماد بعد استبدال النداء';
end $$;

do $$ begin raise notice 'PAYROLL_DISBURSEMENTS_OK'; end $$;
rollback;
