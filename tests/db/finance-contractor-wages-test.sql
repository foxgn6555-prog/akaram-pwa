-- اختبار «أجور المتعهدين» في المالية (00263): الأجور لكل متعهد (متعهد/عامل يومي)، الحساب من الجهة المعتمدة فقط،
-- (العدد − 1) × أجر العامل + أجر المتعهد لكل يوم بعدد > 0، الأيام 0/بلا عدد لا تُدفع، الشهر غير المعتمد ⇒ لا مستحق،
-- نسخ الشهر السابق، التدقيق، العزل. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('0d000000-0000-0000-0000-000000000001', 'it-fw@t.iq'), ('0d000000-0000-0000-0000-000000000002', 'ops-fw@t.iq'),
  ('0d000000-0000-0000-0000-000000000004', 'mgr-fw@t.iq'), ('0d000000-0000-0000-0000-000000000005', 'c1-fw@t.iq'),
  ('0d000000-0000-0000-0000-000000000007', 'c2-fw@t.iq'), ('0d000000-0000-0000-0000-000000000008', 'fin-fw@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('0d000000-0000-0000-0000-000000000001', 'it_admin'), ('0d000000-0000-0000-0000-000000000002', 'ops_room'),
  ('0d000000-0000-0000-0000-000000000004', 'department_manager'), ('0d000000-0000-0000-0000-000000000005', 'employee'),
  ('0d000000-0000-0000-0000-000000000007', 'employee'), ('0d000000-0000-0000-0000-000000000008', 'finance_officer')
on conflict do nothing;
insert into auth.users (id, email) values ('0d000000-0000-0000-0000-000000000006', 'mgr2-fw@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('0d000000-0000-0000-0000-000000000006', 'department_manager') on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('0d000000-0000-0000-0000-000000000004', 'morning', '{1}'), ('0d000000-0000-0000-0000-000000000006', 'evening', '{5}') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it uuid := '0d000000-0000-0000-0000-000000000001'; ops uuid := '0d000000-0000-0000-0000-000000000002';
        c1 uuid := '0d000000-0000-0000-0000-000000000005'; c2 uuid := '0d000000-0000-0000-0000-000000000007'; fin uuid := '0d000000-0000-0000-0000-000000000008';
        m date := '2026-03-01'; r record; n int; i int;
begin
  perform pg_temp.as_user(it);
  perform public.contractor_assign(c1, '0d000000-0000-0000-0000-000000000004', 1::smallint);
  perform public.contractor_assign(c2, '0d000000-0000-0000-0000-000000000006', 5::smallint);
  -- شهر مضى: المتعهد 1 سجّل 16 كل 30 يوماً من آذار (31 يوماً؛ اليوم 31 بلا عدد)، والمتابعة سجّلت 15 في 10 أيام فقط.
  for i in 0..29 loop
    insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c1, 1, m + i, 'contractor', 16, c1);
    if i < 10 then insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c1, 1, m + i, 'follow_up', 15, ops); end if;
  end loop;
  -- المتعهد 2: 5 أيام بعدد 1 (وحده) + يوم بعدد 0
  for i in 0..4 loop insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c2, 5, m + i, 'contractor', 1, c2); end loop;
  insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c2, 5, m + 5, 'contractor', 0, c2);

  -- عزل
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format('select * from public.finance_contractor_wages_sheet(%L)', m), 'FINANCE_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.finance_contractor_rates_set(%L,%L,15000,8000,null)', c1, m), 'FINANCE_FORBIDDEN');

  -- قبل الاعتماد: لا مستحق
  perform pg_temp.as_user(fin);
  perform pg_temp.expect_error(format('select public.finance_contractor_rates_set(%L,%L,-1,8000,null)', c1, m), 'CONTRACTOR_WAGE_INVALID');
  perform public.finance_contractor_rates_set(c1, m, 15000, 8000, 'عقد 2026');
  select * into r from public.finance_contractor_month_status(m);
  if r.approved then raise exception 'month should not be approved yet'; end if;
  if not r.month_ended then raise exception 'month_ended expected'; end if;
  select * into r from public.finance_contractor_wages_sheet(m) where contractor_user_id = c1;
  if r.approved or r.total_pay is not null or r.paid_days <> 0 or not r.rates_set then raise exception 'before approval: got approved=% total=% paid=%', r.approved, r.total_pay, r.paid_days; end if;

  -- اعتماد غرفة العمليات لجهة «المتعهد»
  perform pg_temp.as_user(ops);
  perform public.ops_contractor_month_approve(m, 'contractor', true);
  perform pg_temp.as_user(fin);
  select * into r from public.finance_contractor_wages_sheet(m) where contractor_user_id = c1;
  if not r.approved or r.approved_source <> 'contractor' then raise exception 'approved expected'; end if;
  if r.paid_days <> 30 or r.worker_days <> 450 or r.headcount_total <> 480 then raise exception 'days: paid=% workers=% total=%', r.paid_days, r.worker_days, r.headcount_total; end if;
  if r.workers_pay <> 3600000 or r.contractor_pay <> 450000 or r.total_pay <> 4050000 then raise exception 'pay: w=% c=% t=%', r.workers_pay, r.contractor_pay, r.total_pay; end if;
  if r.set_by_name is null or r.note <> 'عقد 2026' then raise exception 'rate meta missing'; end if;
  -- المتعهد 2 بلا أجور ⇒ null، ثم بعد التحديد: 5 أيام × أجر المتعهد فقط، يوم الصفر لا يُدفع
  select * into r from public.finance_contractor_wages_sheet(m) where contractor_user_id = c2;
  if r.rates_set or r.total_pay is not null or r.paid_days <> 5 or r.worker_days <> 0 then raise exception 'c2 before rates: rates=% total=% paid=% w=%', r.rates_set, r.total_pay, r.paid_days, r.worker_days; end if;
  perform public.finance_contractor_rates_set(c2, m, 20000, 9000, null);
  select * into r from public.finance_contractor_wages_sheet(m) where contractor_user_id = c2;
  if r.total_pay <> 100000 or r.workers_pay <> 0 or r.contractor_pay <> 100000 then raise exception 'c2 pay: %', r.total_pay; end if;

  -- تفصيل الأيام: 31 يوماً؛ اليوم 31 بلا عدد ⇒ لا أجر؛ اليوم 1: 16 ⇒ 15 عاملاً ⇒ 15000 + 120000
  select count(*) into n from public.finance_contractor_wage_days(c1, m);
  if n <> 31 then raise exception 'days rows %', n; end if;
  select * into r from public.finance_contractor_wage_days(c1, m) where log_date = m;
  if r.headcount <> 16 or r.workers <> 15 or r.day_pay <> 135000 or r.workers_pay <> 120000 then raise exception 'day1: %', r; end if;
  select * into r from public.finance_contractor_wage_days(c1, m) where log_date = m + 30;
  if r.headcount is not null or r.day_pay is not null then raise exception 'day31 should be unpaid'; end if;
  select * into r from public.finance_contractor_wage_days(c2, m) where log_date = m + 5;
  if r.headcount <> 0 or r.day_pay is not null then raise exception 'zero day should be unpaid'; end if;

  -- تغيير الجهة المعتمدة إلى «المتابعة» ⇒ 10 أيام × (14 × 8000 + 15000) = 1,270,000
  perform pg_temp.as_user(ops);
  perform public.ops_contractor_month_reopen(m, 'تصحيح الجهة');
  perform public.ops_contractor_month_approve(m, 'follow_up', true);   -- 00303: إقرار صريح بالفجوات
  perform pg_temp.as_user(fin);
  select * into r from public.finance_contractor_wages_sheet(m) where contractor_user_id = c1;
  if r.paid_days <> 10 or r.worker_days <> 140 or r.total_pay <> 1270000 then raise exception 'follow_up: paid=% w=% t=%', r.paid_days, r.worker_days, r.total_pay; end if;

  -- تعديل الأجر ⇒ تدقيق قبل/بعد
  perform public.finance_contractor_rates_set(c1, m, 16000, 8000, null);
  select count(*) into n from public.contractor_audit_log a where a.action = 'finance_rates_set' and a.contractor_user_id = c1 and a.before_data->>'contractor_daily_wage' = '15000.00' and a.after_data->>'contractor_daily_wage' = '16000.00';
  if n <> 1 then raise exception 'audit before/after missing'; end if;

  -- نسخ الشهر السابق إلى نيسان: متعهدان بلا أجور ⇒ 2، ثم 0 عند التكرار
  n := public.finance_contractor_rates_copy_previous('2026-04-01');
  if n <> 2 then raise exception 'copy expected 2 got %', n; end if;
  n := public.finance_contractor_rates_copy_previous('2026-04-01');
  if n <> 0 then raise exception 'copy again expected 0 got %', n; end if;
  select * into r from public.finance_contractor_wages_sheet('2026-04-01') where contractor_user_id = c1;
  if not r.rates_set or r.contractor_daily_wage <> 16000 or r.approved then raise exception 'april copy wrong'; end if;

  -- الدوال القديمة (قائمة العمال) حُذفت
  if exists (select 1 from pg_proc where proname in ('finance_contractor_wage_set', 'finance_contractor_wages_copy_previous')) then raise exception 'old worker-wage RPCs still exist'; end if;

  raise notice 'FINANCE_CONTRACTOR_WAGES_OK';
end $$;
