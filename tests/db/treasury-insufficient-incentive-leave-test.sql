-- 00307: لا صرف نقدي يتجاوز رصيد القاصة · الإجازة التشجيعية تضيف أياماً إلى الرصيد
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('71000000-0000-0000-0000-000000000001','t7-exec@t.iq'),('71000000-0000-0000-0000-000000000002','t7-fin@t.iq'),('71000000-0000-0000-0000-000000000004','t7-emp@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('71000000-0000-0000-0000-000000000001','executive_director'),('71000000-0000-0000-0000-000000000002','finance_officer'),('71000000-0000-0000-0000-000000000004','employee') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values ('71000000-0000-0000-0000-0000000000e4','71000000-0000-0000-0000-000000000004','T7-4','موظف مكافأة','2024-01-01') on conflict (employee_number) do nothing;
do $$ declare j jsonb; r jsonb; msg text; bal0 numeric; y int := extract(year from app.hr_local_date(now()))::int; e uuid := '71000000-0000-0000-0000-0000000000e4'; rem0 numeric; begin
  perform set_config('auth.user_id','71000000-0000-0000-0000-000000000001', false);
  bal0 := app.treasury_balance();
  -- مكافأة نقدية أكبر من الرصيد ⇒ المالية لا تستطيع التأكيد
  j := public.exec_treasury_record('reward', bal0 + 750000, null, e, 'cash', 'اختبار');
  perform set_config('auth.user_id','71000000-0000-0000-0000-000000000002', false);
  begin perform public.finance_treasury_confirm((j->>'id')::uuid, null); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg <> 'TREASURY_INSUFFICIENT' then raise exception 'FAIL T1 expected TREASURY_INSUFFICIENT got %', msg; end if;
  if app.treasury_balance() <> bal0 then raise exception 'FAIL T1b balance changed'; end if;
  if (select status from public.treasury_transactions where id = (j->>'id')::uuid) <> 'pending' then raise exception 'FAIL T1c status'; end if;
  -- استلام يغطي المبلغ ثم التأكيد ينجح
  perform set_config('auth.user_id','71000000-0000-0000-0000-000000000001', false);
  r := public.exec_treasury_record('receipt', 1000000, (select id from public.treasury_receivable_types where is_active order by sort_order limit 1), null, null, 'تغطية');
  perform set_config('auth.user_id','71000000-0000-0000-0000-000000000002', false);
  perform public.finance_treasury_confirm((r->>'id')::uuid, null);
  perform public.finance_treasury_confirm((j->>'id')::uuid, null);
  if app.treasury_balance() <> bal0 + 250000 then raise exception 'FAIL T2 balance % expected %', app.treasury_balance(), bal0 + 250000; end if;
  -- الإجازة التشجيعية: أيام مطلوبة وتُقيَّد في الدفتر
  perform set_config('auth.user_id','71000000-0000-0000-0000-000000000001', false);
  rem0 := (app.hr_balance_of(e, y) ->> 'remaining')::numeric;
  begin perform public.exec_treasury_record('reward', null, null, e, 'incentive_leave', 'بلا أيام'); msg := 'NO_ERROR'; exception when others then msg := sqlerrm; end;
  if msg <> 'TREASURY_LEAVE_DAYS_INVALID' then raise exception 'FAIL T3 expected TREASURY_LEAVE_DAYS_INVALID got %', msg; end if;
  j := public.exec_treasury_record('reward', null, null, e, 'incentive_leave', 'تميز في العمل', 2);
  if j ->> 'status' <> 'confirmed' or (j ->> 'leave_days')::numeric <> 2 then raise exception 'FAIL T4 %', j; end if;
  if (app.hr_balance_of(e, y) ->> 'remaining')::numeric <> rem0 + 2 then raise exception 'FAIL T5 remaining % expected %', app.hr_balance_of(e, y) ->> 'remaining', rem0 + 2; end if;
  if not exists (select 1 from public.hr_leave_ledger where employee_id = e and kind = 'adjust' and days = 2 and note like 'إجازة تشجيعية%') then raise exception 'FAIL T6 ledger'; end if;
  raise notice 'treasury insufficient + incentive leave test ok';
end $$;
