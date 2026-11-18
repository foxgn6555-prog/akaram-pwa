-- أجور المتعهدين على مسار الصرف (20261117150000): «اعتماد وإرسال» ← قرار المدير المفوض ← صرف المالية من القاصة، بقواعد البصمة.
-- معاملة كاملة تُرجَع في النهاية: لا تترك مستخدمين ولا طلبات ولا حركات قاصة. بادئة cw. مستقل (يعتمد على 20261117130000/140000/150000/160000).
--   ① الجاهزية وشروط المنع (كل شرط على حدة) والصلاحيات
--   ② أيام الصرف بالبصمة: دفع/حجب (غياب، إجازة، بلا سجل)، البصمة الناقصة تُدفع، النقص ضمن السماح/عند حده/فوقه، الاستقطاع من أجر المتعهد وحده
--   ③ الإرسال: الأرقام المجمَّدة، الأسطر، الحجب في JSON، الإشعار، منع التكرار
--   ④ تجميد المدخلات أثناء الطلب، الرفض، إعادة الإرسال بإعادة الحساب، الاعتماد، الصرف، نقص الرصيد (كل شيء أو لا شيء)، حارس التكرار
--   ⑤ قاعدة الاستقطاع: سماح قابل للتخصيص، استثناء المتعهد، تعطيل استقطاع النقص، سقف الأجر اليومي، قسمة المطلوب لا رقم ثابت
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
-- بصمة (توقيت بغداد +03:00): دخول في يوم العمل وخروج في اليوم نفسه أو التالي
create or replace function pg_temp.punch(p_emp uuid, p_pin text, p_day date, p_in text, p_out text) returns void language plpgsql as $$
begin
  if p_in is not null then
    insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, direction, method, raw)
    values ('CW-DEV', p_pin, p_emp, ((p_day::text || ' ' || p_in)::timestamp - interval '3 hours') at time zone 'UTC', 'unknown', 'manual', '{}'::jsonb);
  end if;
  if p_out is not null then
    insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, direction, method, raw)
    values ('CW-DEV', p_pin, p_emp, (((p_day + 1)::text || ' ' || p_out)::timestamp - interval '3 hours') at time zone 'UTC', 'unknown', 'manual', '{}'::jsonb);
  end if;
end $$;
-- رصيد القاصة = قيمة محدَّدة (يضيف قبضاً أو مصروفاً بالفرق) فلا يتأثر الاختبار بما في القاعدة من حركات
create or replace function pg_temp.set_balance(p numeric) returns void language plpgsql as $$
declare cur numeric := app.treasury_balance();
begin
  if p > cur then
    insert into public.treasury_transactions (ref_no, kind, amount, type_name, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at)
    values ('TR-CWSEED-' || gen_random_uuid()::text, 'receipt', p - cur, 'cw تمويل', 'confirmed', true, 'c0d00000-0000-4000-8000-000000000002', 'cw', 'c0d00000-0000-4000-8000-000000000002', now());
  elsif p < cur then
    insert into public.treasury_transactions (ref_no, kind, amount, type_name, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at)
    values ('TR-CWSEED-' || gen_random_uuid()::text, 'expense', cur - p, 'cw مصروف', 'confirmed', true, 'c0d00000-0000-4000-8000-000000000002', 'cw', 'c0d00000-0000-4000-8000-000000000002', now());
  end if;
end $$;

-- ═══ بيانات: المدير المفوض + محاسبان + غرفة العمليات + IT + موظف عادي + متعهدان ببصمة + متعهد بلا بصمة ═══
insert into auth.users (id, email) values
  ('c0d00000-0000-4000-8000-000000000001', 'cw-md@t.iq'), ('c0d00000-0000-4000-8000-000000000002', 'cw-f1@t.iq'), ('c0d00000-0000-4000-8000-000000000003', 'cw-f2@t.iq'),
  ('c0d00000-0000-4000-8000-000000000004', 'cw-ops@t.iq'), ('c0d00000-0000-4000-8000-000000000005', 'cw-mgr@t.iq'), ('c0d00000-0000-4000-8000-000000000006', 'cw-it@t.iq'),
  ('c0d00000-0000-4000-8000-000000000007', 'cw-emp@t.iq'),
  ('c0d00000-0000-4000-8000-000000000011', 'cw-c1@t.iq'), ('c0d00000-0000-4000-8000-000000000012', 'cw-c2@t.iq'), ('c0d00000-0000-4000-8000-000000000013', 'cw-c3@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('c0d00000-0000-4000-8000-000000000001', 'super_admin'), ('c0d00000-0000-4000-8000-000000000002', 'finance_officer'), ('c0d00000-0000-4000-8000-000000000003', 'finance_officer'),
  ('c0d00000-0000-4000-8000-000000000004', 'ops_room'), ('c0d00000-0000-4000-8000-000000000005', 'department_manager'), ('c0d00000-0000-4000-8000-000000000006', 'it_admin'),
  ('c0d00000-0000-4000-8000-000000000007', 'employee'),
  ('c0d00000-0000-4000-8000-000000000011', 'employee'), ('c0d00000-0000-4000-8000-000000000012', 'employee'), ('c0d00000-0000-4000-8000-000000000013', 'employee')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('c0d00000-0000-4000-8000-0000000000e1', 'c0d00000-0000-4000-8000-000000000011', 'CW-1', 'cw متعهد أول', '2025-01-01', 'CW1'),
  ('c0d00000-0000-4000-8000-0000000000e2', 'c0d00000-0000-4000-8000-000000000012', 'CW-2', 'cw متعهد ثانٍ', '2025-09-03', 'CW2'),
  ('c0d00000-0000-4000-8000-0000000000e3', 'c0d00000-0000-4000-8000-000000000013', 'CW-3', 'cw متعهد بلا بصمة', '2025-01-01', null)
on conflict (id) do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('c0d00000-0000-4000-8000-000000000005', 'morning', '{1,2,5}') on conflict (user_id) do nothing;
insert into public.contractor_profiles (user_id, manager_user_id, sector_id, shift) values
  ('c0d00000-0000-4000-8000-000000000011', 'c0d00000-0000-4000-8000-000000000005', 1, 'morning'),
  ('c0d00000-0000-4000-8000-000000000012', 'c0d00000-0000-4000-8000-000000000005', 5, 'morning'),
  ('c0d00000-0000-4000-8000-000000000013', 'c0d00000-0000-4000-8000-000000000005', 2, 'morning')   -- متعهد واحد فعّال لكل قاطع (فهرس فريد)
on conflict (user_id) do nothing;
-- شفت مرن 17:00 (كشفهم الفعلي): لا «تأخير» فيه، نقصه خروج مبكر، والمطلوب ≈ 720 دقيقة بعد الدخول
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
  select e.id, (select id from public.hr_shifts where kind = 'flexible' and start_time = '17:00' limit 1), '2025-01-01'
    from public.employees e where e.id in ('c0d00000-0000-4000-8000-0000000000e1', 'c0d00000-0000-4000-8000-0000000000e2', 'c0d00000-0000-4000-8000-0000000000e3');

-- شهر أيلول 2025: بصمات المتعهد الأول (ثمانية أيام مختلفة) والثاني، ثم أعداد المتابعة
do $$
declare e1 uuid := 'c0d00000-0000-4000-8000-0000000000e1'; e2 uuid := 'c0d00000-0000-4000-8000-0000000000e2'; c1 uuid := 'c0d00000-0000-4000-8000-000000000011'; c2 uuid := 'c0d00000-0000-4000-8000-000000000012';
        ops uuid := 'c0d00000-0000-4000-8000-000000000004'; m date := '2025-09-01'; i int; lv uuid;
begin
  assert (select count(*) from public.hr_shifts where kind = 'flexible' and start_time = '17:00') >= 1, 'CW0 flexible shift seed missing';
  perform pg_temp.punch(e1, 'CW1', m + 0, '17:00', '05:00');   -- d1 كامل 12 ساعة
  perform pg_temp.punch(e1, 'CW1', m + 1, '17:00', '04:00');   -- d2 نافذة الشفت فقط 11 ساعة ⇒ نقص 60
  perform pg_temp.punch(e1, 'CW1', m + 2, '19:00', '07:00');   -- d3 دخول متأخر لكن 12 ساعة ⇒ لا نقص (المرن لا يتأخر)
  perform pg_temp.punch(e1, 'CW1', m + 3, '23:00', '07:30');   -- d4 يوم قصير 8.5 ساعة ⇒ نقص 210
  perform pg_temp.punch(e1, 'CW1', m + 4, '17:05', null);      -- d5 بصمة ناقصة (دخول بلا خروج) ⇒ تُدفع
  -- d6 غياب (بلا بصمات)
  perform pg_temp.punch(e1, 'CW1', m + 6, '17:00', '04:50');   -- d7 نقص 10 ⇒ ضمن السماح
  perform pg_temp.punch(e1, 'CW1', m + 7, '17:00', '04:45');   -- d8 نقص 15 ⇒ عند حد السماح (يشمله)
  perform pg_temp.punch(e2, 'CW2', m + 2, '17:00', '05:00');   -- c2 d3 كامل
  perform pg_temp.punch(e2, 'CW2', m + 4, '18:00', '06:00');   -- c2 d5 كامل
  -- c2 d4: إجازة رسمية معتمدة فعلاً من المدير المفوض (المسار الحقيقي ⇒ صف حضور «إجازة»)، وc2 d1/d2 قبل تعيينه ⇒ لا سجل حضور
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000001');
  insert into public.hr_leaves (employee_id, kind, leave_type_id, start_date, end_date, status)
    values (e2, 'leave', (select id from public.hr_leave_types where code = 'official'), m + 3, m + 3, 'pending') returning id into lv;
  perform public.hr_leave_decide(lv, true);
  assert (select status from public.hr_attendance_days where employee_id = e2 and work_date = m + 3) = 'leave', 'CW0 approved leave produced a leave attendance row';
  -- أعداد المصدر follow_up: المتعهد الأول d1..d10 عدد 10 (d9 صفر ⇒ ليس يوم صرف)، الثاني d1..d5 عدد 4
  for i in 0..9 loop insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c1, 1, m + i, 'follow_up', case when i = 8 then 0 else 10 end, ops); end loop;
  for i in 0..4 loop insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c2, 5, m + i, 'follow_up', 4, ops); end loop;
end $$;

-- ═══ CW1 · قبل أي اعتماد: الجاهزية تذكر الشرطين، والصلاحيات ═══
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ declare j jsonb; m date := '2025-09-01'; begin
  j := public.finance_contractor_wages_readiness(m);
  assert j -> 'blockers' = '["month_not_locked","attendance_not_confirmed"]'::jsonb, 'CW1 blockers: ' || (j -> 'blockers')::text;
  assert not (j ->> 'can_send')::boolean and not (j ->> 'locked')::boolean and (j ->> 'contractors')::int = 0 and j -> 'active_request' = 'null'::jsonb, 'CW1 state: ' || j::text;
  raise notice 'CW1a ✅ الجاهزية قبل الاعتماد';
end $$;
do $$ begin
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000001');
  assert (public.finance_contractor_wages_readiness('2025-09-01') ->> 'contractors')::int = 0, 'CW1 MD can read';
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_readiness('2025-09-01') $q$, 'FINANCE_FORBIDDEN');
  perform pg_temp.expect_error($q$ select * from public.finance_contractor_wages_adjusted('2025-09-01') $q$, 'FINANCE_FORBIDDEN');
  perform pg_temp.expect_error($q$ select * from public.finance_contractor_wage_days_adjusted('c0d00000-0000-4000-8000-000000000011', '2025-09-01') $q$, 'FINANCE_FORBIDDEN');
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000007');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_readiness('2025-09-01') $q$, 'FINANCE_FORBIDDEN');
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_readiness('2025-09-01') $q$, 'FINANCE_FORBIDDEN');
  raise notice 'CW1b ✅ القراءة للمالية والمدير المفوض فقط';
end $$;

-- ═══ CW2 · غرفة العمليات تؤكد الحضور وتعتمد الشهر ⇒ الشرط الوحيد المتبقي: الأجور غير محدَّدة ═══
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
select public.ops_attendance_confirm('2025-09-01') ->> 'status' as attendance;
select (public.ops_contractor_month_approve('2025-09-01', 'follow_up', true)).approved_source;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ declare j jsonb; m date := '2025-09-01'; begin
  j := public.finance_contractor_wages_readiness(m);
  assert j -> 'blockers' = '["rates_missing"]'::jsonb and (j ->> 'missing_rates')::int = 2 and (j ->> 'contractors')::int = 2 and (j ->> 'locked')::boolean, 'CW2 blockers: ' || j::text;
  assert j -> 'net_total' = 'null'::jsonb and j -> 'gross_total' = 'null'::jsonb, 'CW2 no totals while rates are missing';
  perform public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000011', m, 50000, 30000, null);
  j := public.finance_contractor_wages_readiness(m);
  assert j -> 'blockers' = '["rates_missing"]'::jsonb and (j ->> 'missing_rates')::int = 1, 'CW2 one missing: ' || j::text;
  perform public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000012', m, 60000, 25000, null);
  j := public.finance_contractor_wages_readiness(m);
  assert j -> 'blockers' = '[]'::jsonb and (j ->> 'can_send')::boolean and (j ->> 'no_fingerprint')::int = 0 and (j ->> 'attendance_pending_auto')::int = 0, 'CW2 ready: ' || j::text;
  assert (j ->> 'gross_total')::numeric = 3555000 and (j ->> 'deductions_total')::numeric = 1063750 and (j ->> 'net_total')::numeric = 2491250, 'CW2 totals: ' || j::text;
  raise notice 'CW2 ✅ الاعتماد والأجور ⇒ جاهز (إجمالي 3,555,000 · حجب واستقطاع 1,063,750 · صافٍ 2,491,250)';
end $$;

-- ═══ CW3 · الكشف المعدَّل بالبصمة لكل متعهد ═══
do $$ declare r record; m date := '2025-09-01'; begin
  select * into r from public.finance_contractor_wages_adjusted(m) where contractor_user_id = 'c0d00000-0000-4000-8000-000000000011';
  assert r.fingerprint_linked and r.rates_set and r.pay_days = 9 and r.paid_days = 7 and r.blocked_days = 2 and r.late_days = 2 and r.deduction_minutes = 270, 'CW3 C1 days: ' || row_to_json(r)::text;
  assert r.contractor_daily_wage = 50000 and r.worker_daily_wage = 30000, 'CW3 C1 rates';
  assert r.gross_pay = 2880000 and r.blocked_pay = 640000 and r.deduction_amount = 18750 and r.net_pay = 2221250, 'CW3 C1 money: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wages_adjusted(m) where contractor_user_id = 'c0d00000-0000-4000-8000-000000000012';
  assert r.pay_days = 5 and r.paid_days = 2 and r.blocked_days = 3 and r.late_days = 0 and r.gross_pay = 675000 and r.blocked_pay = 405000 and r.deduction_amount = 0 and r.net_pay = 270000, 'CW3 C2: ' || row_to_json(r)::text;
  -- غير المقفل ⇒ الأرقام فارغة (لا تخمين)
  select * into r from public.finance_contractor_wages_adjusted('2025-10-01') where contractor_user_id = 'c0d00000-0000-4000-8000-000000000011';
  assert r.gross_pay is null and r.net_pay is null and r.pay_days = 0, 'CW3 unlocked month has no numbers: ' || row_to_json(r)::text;
  raise notice 'CW3 ✅ الكشف المعدَّل';
end $$;

-- ═══ CW4 · تفصيل أيام المتعهد الأول: كل يوم بحالته وسببه وأرقامه ═══
do $$ declare r record; m date := '2025-09-01'; c1 uuid := 'c0d00000-0000-4000-8000-000000000011'; c2 uuid := 'c0d00000-0000-4000-8000-000000000012'; begin
  assert (select count(*) from public.finance_contractor_wage_days_adjusted(c1, m)) = 30, 'CW4 one row per calendar day';
  -- d1 كامل
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m;
  assert r.state = 'paid' and r.block_reason is null and r.headcount = 10 and r.workers = 9 and r.required_minutes = 720 and r.shortfall_minutes = 0 and r.deduct_minutes = 0 and r.base_pay = 320000 and r.deduction = 0 and r.day_pay = 320000, 'CW4 d1: ' || row_to_json(r)::text;
  -- d2 نقص 60 فوق السماح 15 ⇒ يُستقطع كله من أجر المتعهد وحده: 50,000 × 60 ÷ 720 = 4,166.67 ⇒ 4,167
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 1;
  assert r.state = 'paid' and r.required_minutes = 720 and r.shortfall_minutes = 60 and r.grace_minutes = 15 and r.deduct_minutes = 60 and r.base_pay = 320000 and r.deduction = 4167 and r.day_pay = 315833, 'CW4 d2: ' || row_to_json(r)::text;
  -- d3 دخل متأخراً ساعتين وأكمل 12 ساعة ⇒ لا نقص
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 2;
  assert r.state = 'paid' and r.shortfall_minutes = 0 and r.deduction = 0 and r.day_pay = 320000, 'CW4 d3: ' || row_to_json(r)::text;
  -- d4 نقص 210: 50,000 × 210 ÷ 720 = 14,583.33 ⇒ 14,583
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 3;
  assert r.state = 'paid' and r.shortfall_minutes = 210 and r.deduct_minutes = 210 and r.deduction = 14583 and r.day_pay = 305417, 'CW4 d4: ' || row_to_json(r)::text;
  -- d5 بصمة ناقصة: تُدفع كاملة كالموظفين، بلا استقطاع ولا حجب
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 4;
  assert r.state = 'paid' and r.block_reason is null and r.shortfall_minutes = 0 and r.deduction = 0 and r.day_pay = 320000 and r.check_in is not null and r.check_out is null, 'CW4 d5 incomplete is paid: ' || row_to_json(r)::text;
  -- d6 غياب بصمة ⇒ يُحجب اليوم كله (أجر المتعهد وعماله التسعة)
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 5;
  assert r.state = 'blocked' and r.block_reason = 'absent' and r.base_pay = 320000 and r.deduction = 0 and r.day_pay = 0 and r.workers = 9, 'CW4 d6 blocked: ' || row_to_json(r)::text;
  -- d7 نقص 10 ضمن السماح، وd8 نقص 15 عند حده (يشمله) ⇒ لا استقطاع
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 6;
  assert r.shortfall_minutes = 10 and r.grace_minutes = 15 and r.deduct_minutes = 0 and r.deduction = 0 and r.day_pay = 320000, 'CW4 d7 within grace: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 7;
  assert r.shortfall_minutes = 15 and r.grace_minutes = 15 and r.deduct_minutes = 0 and r.deduction = 0 and r.day_pay = 320000, 'CW4 d8 at grace: ' || row_to_json(r)::text;
  -- d9 عدد صفر ⇒ ليس يوم صرف: لا حالة ولا أرقام
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 8;
  assert r.state is null and r.headcount is null and r.day_pay is null, 'CW4 d9 not a pay day: ' || row_to_json(r)::text;
  -- d10 يوم صرف بلا بصمات ⇒ محجوب
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 9;
  assert r.state = 'blocked' and r.block_reason = 'absent' and r.day_pay = 0, 'CW4 d10: ' || row_to_json(r)::text;
  -- d11.. بلا عدد ⇒ لا أجر
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 10;
  assert r.state is null and r.day_pay is null, 'CW4 d11: ' || row_to_json(r)::text;
  -- المتعهد الثاني: d1/d2 قبل تعيينه ⇒ لا سجل حضور (محجوب)، d3 حاضر، d4 إجازة معتمدة (محجوب بسببها)، d5 حاضر
  select * into r from public.finance_contractor_wage_days_adjusted(c2, m) where log_date = m;
  assert r.state = 'blocked' and r.block_reason = 'no_record' and r.base_pay = 135000 and r.day_pay = 0, 'CW4 c2 d1 no record: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c2, m) where log_date = m + 2;
  assert r.state = 'paid' and r.day_pay = 135000 and r.workers = 3, 'CW4 c2 d3: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c2, m) where log_date = m + 3;
  assert r.state = 'blocked' and r.block_reason = 'leave' and r.day_pay = 0, 'CW4 c2 d4 leave: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c2, m) where log_date = m + 4;
  assert r.state = 'paid' and r.day_pay = 135000, 'CW4 c2 d5: ' || row_to_json(r)::text;
  -- مجاميع الأيام = مجاميع الكشف
  assert (select sum(day_pay) from public.finance_contractor_wage_days_adjusted(c1, m)) = 2221250, 'CW4 C1 days sum';
  assert (select sum(day_pay) from public.finance_contractor_wage_days_adjusted(c2, m)) = 270000, 'CW4 C2 days sum';
  raise notice 'CW4 ✅ تفصيل الأيام: دفع/حجب/ضمن السماح/عند الحد/فوقه/بصمة ناقصة/إجازة/بلا سجل';
end $$;

-- ═══ CW5 · شروط المنع عند الإرسال، كل شرط برمزه (أشهر مساعدة) ═══
-- نيسان 2025: غير مقفل ⇒ MONTH_NOT_LOCKED
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-04-01') $q$, 'CONTRACTOR_WAGES_MONTH_NOT_LOCKED');
  assert (select count(*) from public.payroll_disbursements where kind = 'contractor_wages' and period_month = '2025-04-01') = 0, 'CW5 nothing created';
end $$;
-- آذار 2025: مقفل لكن الحضور غير مؤكَّد ⇒ HR_ATTENDANCE_NOT_CONFIRMED
insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values ('c0d00000-0000-4000-8000-000000000011', 1, '2025-03-05', 'follow_up', 3, 'c0d00000-0000-4000-8000-000000000004');
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
select (public.ops_contractor_month_approve('2025-03-01', 'follow_up', true)).approved_source;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-03-01') $q$, 'HR_ATTENDANCE_NOT_CONFIRMED');
  assert public.finance_contractor_wages_readiness('2025-03-01') -> 'blockers' ? 'attendance_not_confirmed', 'CW5 readiness agrees with close';
end $$;
-- تموز 2025: مقفل ومؤكَّد بلا أي عدد ⇒ NO_DAYS
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
select public.ops_attendance_confirm('2025-07-01') ->> 'status' as attendance;
select (public.ops_contractor_month_approve('2025-07-01', 'follow_up', true)).approved_source;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-07-01') $q$, 'CONTRACTOR_WAGES_NO_DAYS');
  assert public.finance_contractor_wages_readiness('2025-07-01') -> 'blockers' = '["no_days"]'::jsonb, 'CW5 no_days alone';
end $$;
-- آب 2025: المتعهد الثالث بلا رقم بصمة ⇒ RATES_MISSING:1 ثم (بعد تحديد أجره) NO_FINGERPRINT:1
insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by)
  select 'c0d00000-0000-4000-8000-000000000013', 2, '2025-08-01'::date + i, 'follow_up', 2, 'c0d00000-0000-4000-8000-000000000004' from generate_series(0, 2) i;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
select public.ops_attendance_confirm('2025-08-01') ->> 'status' as attendance;
select (public.ops_contractor_month_approve('2025-08-01', 'follow_up', true)).approved_source;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ begin
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-08-01') $q$, 'CONTRACTOR_WAGES_RATES_MISSING:1');
  perform public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000013', '2025-08-01', 40000, 20000, null);
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-08-01') $q$, 'CONTRACTOR_WAGES_NO_FINGERPRINT:1');
  assert public.finance_contractor_wages_readiness('2025-08-01') -> 'blockers' = '["no_fingerprint"]'::jsonb, 'CW5 no_fingerprint alone: ' || (public.finance_contractor_wages_readiness('2025-08-01'))::text;
  assert not (select fingerprint_linked from public.finance_contractor_wages_adjusted('2025-08-01') where contractor_user_id = 'c0d00000-0000-4000-8000-000000000013'), 'CW5 not linked';
end $$;
-- حزيران 2025: أيام صرف كلها بلا بصمة ⇒ الصافي صفر ⇒ NOTHING_PAYABLE
insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by)
  select 'c0d00000-0000-4000-8000-000000000011', 1, '2025-06-02'::date + i, 'follow_up', 5, 'c0d00000-0000-4000-8000-000000000004' from generate_series(0, 1) i;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
select public.ops_attendance_confirm('2025-06-01') ->> 'status' as attendance;
select (public.ops_contractor_month_approve('2025-06-01', 'follow_up', true)).approved_source;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ begin
  perform public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000011', '2025-06-01', 50000, 30000, null);
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-06-01') $q$, 'CONTRACTOR_WAGES_NOTHING_PAYABLE');
  assert public.finance_contractor_wages_readiness('2025-06-01') -> 'blockers' = '["nothing_payable"]'::jsonb, 'CW5 nothing_payable alone';
  assert (select count(*) from public.payroll_disbursements where period_month in ('2025-03-01', '2025-04-01', '2025-06-01', '2025-07-01', '2025-08-01')) = 0, 'CW5 no request was created by any rejected attempt';
  raise notice 'CW5 ✅ شروط المنع الستة برموزها (ولا طلب ينشأ عند أي منها)';
end $$;

-- ═══ CW6 · الإرسال: الصلاحية ثم النجاح بأرقام مجمَّدة ═══
do $$ begin
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-09-01') $q$, 'PERMISSION_DENIED');
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000007');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-09-01') $q$, 'PERMISSION_DENIED');
  -- المدير المفوض بلا دور مالي: لا يضغط «اعتماد وإرسال» (يقرر فقط)
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-09-01') $q$, 'PERMISSION_DENIED');
  -- مسؤول التطوير يعبر بوابة الصلاحيات لكن دالة الإرسال ذاتها تشترط دوراً مالياً
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-09-01') $q$, 'DISBURSEMENT_FORBIDDEN');
  assert (select count(*) from public.payroll_disbursements where kind = 'contractor_wages' and period_month = '2025-09-01') = 0, 'CW6 nothing created by denied calls';
  raise notice 'CW6a ✅ الإرسال للمالية فقط';
end $$;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ declare j jsonb; d public.payroll_disbursements; m date := '2025-09-01'; n int; begin
  perform pg_temp.set_balance(9000000);
  j := public.finance_contractor_wages_close(m, 'جاهز للقرار');
  perform set_config('test.cw_req1', j ->> 'id', false);
  assert j ->> 'kind' = 'contractor_wages' and j ->> 'status' = 'pending_approval' and (j ->> 'version')::int = 1 and j ->> 'kind_label' = 'أجور المتعهدين', 'CW6 request: ' || j::text;
  assert (j ->> 'net_total')::numeric = 2491250 and (j ->> 'gross_total')::numeric = 3555000 and (j ->> 'deductions_total')::numeric = 1063750 and (j ->> 'people_count')::int = 2 and (j ->> 'payable_count')::int = 2, 'CW6 numbers: ' || j::text;
  assert j ->> 'request_no' ~ '^DSB-[0-9]{4}-[0-9]{4}$' and (j ->> 'requested_by')::uuid = 'c0d00000-0000-4000-8000-000000000002' and j ->> 'source_export_id' is null, 'CW6 meta: ' || j::text;
  -- الحجب والاستقطاع منفصلان في JSON الطلب: 5 أيام محجوبة بقيمة 1,045,000
  assert (j ->> 'blocked_days')::int = 5 and (j ->> 'blocked_amount')::numeric = 1045000, 'CW6 blocked_*: ' || j::text;
  select * into d from public.payroll_disbursements where id = (j ->> 'id')::uuid;
  -- الأسطر: لكل متعهد سطر مجمَّد بتفاصيل أيامه، ومجموع صافيها = صافي الطلب
  assert (select count(*) from public.payroll_disbursement_lines where disbursement_id = d.id) = 2 and (select sum(net_amount) from public.payroll_disbursement_lines where disbursement_id = d.id) = d.net_total, 'CW6 lines';
  select count(*) into n from public.payroll_disbursement_lines l where l.disbursement_id = d.id and l.job_title = 'متعهد' and l.person_id in ('c0d00000-0000-4000-8000-000000000011', 'c0d00000-0000-4000-8000-000000000012');
  assert n = 2, 'CW6 contractor lines';
  assert exists (select 1 from public.payroll_disbursement_lines l where l.disbursement_id = d.id and l.person_id = 'c0d00000-0000-4000-8000-000000000011' and l.person_number = 'CW-1'
                   and l.gross_amount = 2880000 and l.deductions_total = 658750 and l.net_amount = 2221250 and l.has_deduction
                   and (l.details ->> 'pay_days')::int = 9 and (l.details ->> 'paid_days')::int = 7 and (l.details ->> 'blocked_days')::int = 2 and (l.details ->> 'late_days')::int = 2
                   and (l.details ->> 'deduction_minutes')::int = 270 and (l.details ->> 'blocked_amount')::numeric = 640000 and (l.details ->> 'deduction_amount')::numeric = 18750
                   and (l.details ->> 'contractor_daily_wage')::numeric = 50000 and (l.details ->> 'worker_daily_wage')::numeric = 30000 and jsonb_array_length(l.details -> 'days') = 9), 'CW6 C1 line';
  assert exists (select 1 from public.payroll_disbursement_lines l, jsonb_array_elements(l.details -> 'days') x where l.disbursement_id = d.id and l.person_id = 'c0d00000-0000-4000-8000-000000000011'
                   and x ->> 'date' = '2025-09-02' and x ->> 'state' = 'paid' and (x ->> 'shortfall')::int = 60 and (x ->> 'required')::int = 720 and (x ->> 'grace')::int = 15 and (x ->> 'deduction')::numeric = 4167 and (x ->> 'pay')::numeric = 315833), 'CW6 frozen day detail';
  assert exists (select 1 from public.payroll_disbursement_lines l, jsonb_array_elements(l.details -> 'days') x where l.disbursement_id = d.id and l.person_id = 'c0d00000-0000-4000-8000-000000000012'
                   and x ->> 'date' = '2025-09-04' and x ->> 'state' = 'blocked' and x ->> 'reason' = 'leave' and (x ->> 'pay')::numeric = 0), 'CW6 frozen leave day';
  -- حدث created واحد، ولا حركة قاصة، والرصيد كما هو
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = d.id and event = 'created' and actor = 'c0d00000-0000-4000-8000-000000000002') = 1, 'CW6 created event';
  assert (select count(*) from public.treasury_transactions where kind = 'contractor_wages') = 0 and app.treasury_balance() = 9000000, 'CW6 no treasury movement on send';
  -- إشعار المدير المفوض برابط الطلب، ولا إشعار للمالية
  assert exists (select 1 from public.notifications where user_id = 'c0d00000-0000-4000-8000-000000000001' and dedupe_key = 'disb_created:' || d.id and link = '/admin/disbursements/' || d.id), 'CW6 MD notified';
  assert not exists (select 1 from public.notifications where user_id in ('c0d00000-0000-4000-8000-000000000002', 'c0d00000-0000-4000-8000-000000000003') and dedupe_key = 'disb_created:' || d.id), 'CW6 finance not notified';
  -- الجاهزية بعد الإرسال: طلب قائم، لا إرسال ثانٍ
  j := public.finance_contractor_wages_readiness(m);
  assert j -> 'blockers' ? 'active_request' and not (j ->> 'can_send')::boolean and (j -> 'active_request' ->> 'id')::uuid = d.id and j -> 'active_request' ->> 'status' = 'pending_approval', 'CW6 active: ' || j::text;
  perform pg_temp.expect_error(format('select public.finance_contractor_wages_close(%L)', m), 'DISBURSEMENT_ACTIVE_EXISTS');
  assert (select count(*) from public.payroll_disbursements where kind = 'contractor_wages' and period_month = m) = 1, 'CW6 still exactly one request';
  -- لقطة الأسطر مجمَّدة: تعديل لاحق على المصدر لا يغيّرها
  update public.contractor_rates set contractor_daily_wage = 1 where contractor_user_id = 'c0d00000-0000-4000-8000-000000000011' and month = m;
  assert (select net_amount from public.payroll_disbursement_lines where disbursement_id = d.id and person_id = 'c0d00000-0000-4000-8000-000000000011') = 2221250, 'CW6 frozen lines are a snapshot';
  update public.contractor_rates set contractor_daily_wage = 50000 where contractor_user_id = 'c0d00000-0000-4000-8000-000000000011' and month = m;
  raise notice 'CW6b ✅ الإرسال بأرقام وأسماء مجمَّدة ومنع التكرار';
end $$;

-- ═══ CW7 · تجميد المدخلات ما دام للشهر طلب قائم ═══
do $$ begin
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error($q$ select public.ops_contractor_month_reopen('2025-09-01', 'تصحيح') $q$, 'CONTRACTOR_MONTH_HAS_DISBURSEMENT');
  assert (select is_locked from public.contractor_month_approvals where month = '2025-09-01'), 'CW7 month still locked';
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error($q$ select public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000011', '2025-09-01', 60000, 30000, null) $q$, 'DISBURSEMENT_RATES_FROZEN');
  perform pg_temp.expect_error($q$ select public.finance_contractor_rates_copy_previous('2025-09-01') $q$, 'DISBURSEMENT_RATES_FROZEN');
  assert (select contractor_daily_wage from public.contractor_rates where contractor_user_id = 'c0d00000-0000-4000-8000-000000000011' and month = '2025-09-01') = 50000, 'CW7 rate untouched';
  -- التجميد خاص بهذا الشهر: أجور غيره تُعدَّل، وإعادة فتح غيره (من لا طلب له) ممكنة
  perform public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000011', '2025-10-01', 55000, 30000, null);
  assert (select contractor_daily_wage from public.contractor_rates where contractor_user_id = 'c0d00000-0000-4000-8000-000000000011' and month = '2025-10-01') = 55000, 'CW7 other months are not frozen';
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
  perform public.ops_contractor_month_reopen('2025-07-01', 'تصحيح');
  assert not (select is_locked from public.contractor_month_approvals where month = '2025-07-01'), 'CW7 a month without a request can still be reopened';
  raise notice 'CW7 ✅ التجميد';
end $$;

-- ═══ CW8 · قرار المدير المفوض: الرفض بسبب إلزامي ثم يعود الطلب للمالية ═══
do $$ declare j jsonb; id1 uuid := current_setting('test.cw_req1')::uuid; begin
  -- المالية لا تقرر (بوابة الصلاحيات)، ومسؤول التطوير يعبر البوابة لكن الدالة ذاتها تشترط المدير المفوض
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', id1, 'سبب'), 'PERMISSION_DENIED');
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000006');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', id1, 'سبب'), 'DISBURSEMENT_FORBIDDEN');
  assert (select status from public.payroll_disbursements where id = id1) = 'pending_approval', 'CW8 denied calls changed nothing';
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000001');
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, false, %L)', id1, '  '), 'DISBURSEMENT_REASON_REQUIRED');
  j := public.disbursement_decide(id1, false, 'أجر المتعهد الأول مرتفع، راجعوه');
  assert j ->> 'status' = 'rejected' and j ->> 'decision_note' = 'أجر المتعهد الأول مرتفع، راجعوه' and (j ->> 'decided_by')::uuid = 'c0d00000-0000-4000-8000-000000000001', 'CW8 rejected: ' || j::text;
  assert (select count(*) from public.treasury_transactions where kind = 'contractor_wages') = 0, 'CW8 rejection moves no money';
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = id1 and event = 'rejected' and note = 'أجر المتعهد الأول مرتفع، راجعوه') = 1, 'CW8 rejected event with the reason';
  assert exists (select 1 from public.notifications where user_id = 'c0d00000-0000-4000-8000-000000000002' and dedupe_key = 'disb_rejected:' || id1 and body like '%السبب: أجر المتعهد الأول مرتفع%' and link = '/finance/disbursements/' || id1), 'CW8 finance notified with the reason';
  -- الجاهزية: لا طلب قائم الآن، وآخر مرفوض بسببه ⇒ يمكن الإرسال من جديد
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  j := public.finance_contractor_wages_readiness('2025-09-01');
  assert j -> 'blockers' = '[]'::jsonb and (j ->> 'can_send')::boolean and j -> 'active_request' = 'null'::jsonb and (j -> 'latest_rejected' ->> 'id')::uuid = id1 and j -> 'latest_rejected' ->> 'decision_note' like 'أجر المتعهد%', 'CW8 readiness after rejection: ' || j::text;
  raise notice 'CW8 ✅ الرفض بسبب';
end $$;

-- ═══ CW9 · بعد الرفض: تُفتح الأجور، وإعادة الإرسال تُنشئ نسخة جديدة تُحسب من البيانات الحالية ═══
do $$ declare j jsonb; id1 uuid := current_setting('test.cw_req1')::uuid; id2 uuid; begin
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  perform public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000011', '2025-09-01', 60000, 30000, 'بعد الرفض');
  j := public.disbursement_resubmit(id1, 'عُدِّل الأجر اليومي');
  id2 := (j ->> 'id')::uuid;
  perform set_config('test.cw_req2', id2::text, false);
  assert id2 <> id1 and (j ->> 'version')::int = 2 and j ->> 'status' = 'pending_approval' and (j ->> 'supersedes_id')::uuid = id1 and j ->> 'kind' = 'contractor_wages', 'CW9 new version: ' || j::text;
  -- أُعيد الحساب: أجر المتعهد الأول 60,000 ⇒ إجمالي 9 × 330,000 = 2,970,000 · حجب 660,000 · استقطاع 5,000 + 17,500 · صافي 2,287,500 (+ 270,000 للثاني)
  assert (j ->> 'net_total')::numeric = 2557500 and (j ->> 'gross_total')::numeric = 3645000 and (j ->> 'deductions_total')::numeric = 1087500 and (j ->> 'blocked_amount')::numeric = 1065000 and (j ->> 'blocked_days')::int = 5, 'CW9 recomputed: ' || j::text;
  assert (select net_total from public.payroll_disbursements where id = id1) = 2491250, 'CW9 the rejected version keeps its old numbers';
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = id1 and event = 'resubmitted') = 1 and (select count(*) from public.payroll_disbursement_events where disbursement_id = id2 and event = 'created') = 1, 'CW9 events';
  assert exists (select 1 from public.notifications where user_id = 'c0d00000-0000-4000-8000-000000000001' and dedupe_key = 'disb_created:' || id2 and title like 'أُعيد إرسال طلب صرف%' and body like '%النسخة 2%'), 'CW9 MD notified of the resubmission';
  -- المرفوض يعرف خلَفه، ولا إعادة إرسال ثانية ولا إرسال جديد (طلب فعّال)
  j := public.disbursement_get(id1);
  assert (j -> 'request' ->> 'resubmitted_id')::uuid = id2 and (j -> 'request' ->> 'resubmitted_version')::int = 2, 'CW9 predecessor links to successor: ' || (j -> 'request')::text;
  perform pg_temp.expect_error(format('select public.disbursement_resubmit(%L)', id1), 'DISBURSEMENT_ACTIVE_EXISTS');
  perform pg_temp.expect_error(format('select public.finance_contractor_wages_close(%L)', '2025-09-01'::date), 'DISBURSEMENT_ACTIVE_EXISTS');
  perform pg_temp.expect_error(format('select public.disbursement_resubmit(%L)', id2), 'DISBURSEMENT_NOT_REJECTED');
  raise notice 'CW9 ✅ إعادة الإرسال بإعادة الحساب';
end $$;

-- ═══ CW10 · الاعتماد ثم الصرف: نقص الرصيد يُرفض كاملاً، وبعد التغطية حركة واحدة نهائية ═══
do $$ declare j jsonb; id2 uuid := current_setting('test.cw_req2')::uuid; t public.treasury_transactions; b0 numeric; begin
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', id2), 'DISBURSEMENT_NOT_APPROVED');   -- لم يُعتمد بعد
  -- حارس التكرار (النافذة 8 ثوانٍ): الضغطة المكررة تُرفض قبل أي منطق
  perform set_config('app.dedup_window_seconds', '8', true);
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000001');
  j := public.disbursement_decide(id2, true, 'اعتُمد');
  assert j ->> 'status' = 'approved' and (j ->> 'decided_by')::uuid = 'c0d00000-0000-4000-8000-000000000001', 'CW10 approved: ' || j::text;
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true, %L)', id2, 'اعتُمد'), 'DUPLICATE_SUBMIT');
  perform set_config('app.dedup_window_seconds', '0', true);
  perform pg_temp.expect_error(format('select public.disbursement_decide(%L, true, %L)', id2, 'اعتُمد'), 'DISBURSEMENT_NOT_PENDING');
  assert (select count(*) from public.treasury_transactions where kind = 'contractor_wages') = 0 and app.treasury_balance() = 9000000, 'CW10 approval moves no money';
  assert (select count(*) from public.notifications where dedupe_key = 'disb_approved:' || id2 and user_id in ('c0d00000-0000-4000-8000-000000000002', 'c0d00000-0000-4000-8000-000000000003') and link = '/finance/disbursements/' || id2) = 2
     and not exists (select 1 from public.notifications where dedupe_key = 'disb_approved:' || id2 and user_id = 'c0d00000-0000-4000-8000-000000000001'), 'CW10 finance notified, MD not';
  -- الصرف: المدير المفوض (بلا دور مالي) لا يصرف
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', id2), 'PERMISSION_DENIED');
  -- رصيد أقل بدينار واحد ⇒ TREASURY_INSUFFICIENT، ولا شيء يتغيّر
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  perform pg_temp.set_balance(2557499);
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L)', id2), 'TREASURY_INSUFFICIENT');
  assert (select status from public.payroll_disbursements where id = id2) = 'approved' and (select count(*) from public.treasury_transactions where kind = 'contractor_wages') = 0 and app.treasury_balance() = 2557499
     and (select treasury_tx_id from public.payroll_disbursements where id = id2) is null and (select count(*) from public.payroll_disbursement_events where disbursement_id = id2 and event = 'paid') = 0, 'CW10 all-or-nothing on insufficient balance';
  -- تغطية الرصيد ⇒ نجاح بحركة قاصة واحدة نهائية بمبلغ الطلب بالضبط
  perform pg_temp.set_balance(5000000);
  b0 := app.treasury_balance();
  perform set_config('app.dedup_window_seconds', '8', true);
  j := public.disbursement_pay(id2, 'سُلّمت للمتعهدين');
  assert j ->> 'status' = 'paid' and (j ->> 'paid_by')::uuid = 'c0d00000-0000-4000-8000-000000000002' and j ->> 'treasury_ref_no' is not null, 'CW10 paid: ' || j::text;
  select * into t from public.treasury_transactions where id = (j ->> 'treasury_tx_id')::uuid;
  assert t.kind = 'contractor_wages' and t.status = 'confirmed' and t.affects_balance and t.amount = 2557500 and t.type_name = 'أجور المتعهدين' and t.confirmed_by = 'c0d00000-0000-4000-8000-000000000002' and t.finance_note = 'سُلّمت للمتعهدين'
     and t.details like '%' || (j ->> 'request_no') || '%' and t.details like '%2025-09%', 'CW10 transaction: ' || row_to_json(t)::text;
  assert app.treasury_balance() = b0 - 2557500, 'CW10 balance decreased by exactly the net';
  assert (select count(*) from public.treasury_transactions where kind = 'contractor_wages') = 1, 'CW10 one transaction';
  assert (select count(*) from public.payroll_disbursement_events where disbursement_id = id2 and event = 'paid' and actor = 'c0d00000-0000-4000-8000-000000000002' and amount = 2557500) = 1
     and (select count(*) from public.payroll_disbursement_events where disbursement_id = id2 and event = 'approved' and actor = 'c0d00000-0000-4000-8000-000000000001') = 1
     and (select treasury_tx_id from public.payroll_disbursements where id = id2) = t.id, 'CW10 events and the link to the transaction';
  assert exists (select 1 from public.notifications where user_id = 'c0d00000-0000-4000-8000-000000000001' and dedupe_key = 'disb_paid:' || id2 and link = '/admin/disbursements/' || id2), 'CW10 MD notified of payment';
  -- ضغطة مكررة خلال النافذة ⇒ DUPLICATE_SUBMIT؛ وبعدها (دون نافذة) الدالة نفسها ترفض بـALREADY_PAID؛ ولا خصم ثانٍ
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L, %L)', id2, 'سُلّمت للمتعهدين'), 'DUPLICATE_SUBMIT');
  perform set_config('app.dedup_window_seconds', '0', true);
  perform pg_temp.expect_error(format('select public.disbursement_pay(%L, %L)', id2, 'مرة أخرى'), 'DISBURSEMENT_ALREADY_PAID');
  assert (select count(*) from public.treasury_transactions where kind = 'contractor_wages') = 1 and app.treasury_balance() = b0 - 2557500, 'CW10 no second debit';
  -- ملخص القاصة يعرض الأجور المصروفة
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000001');
  assert (public.treasury_summary() -> 'range' ->> 'contractor_wages_confirmed')::numeric = 2557500, 'CW10 treasury summary: ' || (public.treasury_summary() -> 'range')::text;
  raise notice 'CW10 ✅ الاعتماد · نقص الرصيد كل شيء أو لا شيء · الصرف مرة واحدة';
end $$;

-- ═══ CW11 · بعد الصرف: الشهر مجمَّد نهائياً ═══
do $$ begin
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
  perform pg_temp.expect_error($q$ select public.ops_contractor_month_reopen('2025-09-01', 'بعد الصرف') $q$, 'CONTRACTOR_MONTH_HAS_DISBURSEMENT');
  perform pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
  perform pg_temp.expect_error($q$ select public.finance_contractor_rates_set('c0d00000-0000-4000-8000-000000000011', '2025-09-01', 1, 1, null) $q$, 'DISBURSEMENT_RATES_FROZEN');
  perform pg_temp.expect_error($q$ select public.finance_contractor_wages_close('2025-09-01') $q$, 'DISBURSEMENT_ACTIVE_EXISTS');
  assert (public.finance_contractor_wages_readiness('2025-09-01') -> 'active_request' ->> 'status') = 'paid', 'CW11 readiness shows the paid request';
  raise notice 'CW11 ✅ التجميد بعد الصرف';
end $$;

-- ═══ CW12 · قاعدة الاستقطاع على أيام مصنَّعة بمقاييس دقيقة (المحفِّز الحاسب للمقاييس مُعطَّل داخل المعاملة المُرجَعة) ═══
alter table public.hr_attendance_days disable trigger trg_hr_attendance_metrics;
do $$ declare
  c1 uuid := 'c0d00000-0000-4000-8000-000000000011'; e1 uuid := 'c0d00000-0000-4000-8000-0000000000e1'; ops uuid := 'c0d00000-0000-4000-8000-000000000004'; m date := '2025-05-01'; i int;
begin
  -- أيار 2025: عشرة أيام بعدد 1 (المتعهد وحده)، لكل يوم حالة ومقاييس
  for i in 0..9 loop insert into public.contractor_daily_counts (contractor_user_id, sector_id, log_date, source, headcount, entered_by) values (c1, 1, m + i, 'follow_up', 1, ops); end loop;
  insert into public.hr_attendance_days (employee_id, work_date, status, source, required_minutes, shortfall_minutes) values
    (e1, m + 0, 'early_leave', 'auto', 720, 16),     -- فوق السماح بدقيقة ⇒ يُستقطع 16: 50,000 × 16 ÷ 720 = 1,111.11 ⇒ 1,111
    (e1, m + 1, 'early_leave', 'auto', 720, 15),     -- عند السماح ⇒ لا
    (e1, m + 2, 'early_leave', 'auto', 480, 30),     -- المطلوب 480 لا 660 ولا 720: 50,000 × 30 ÷ 480 = 3,125 تماماً
    (e1, m + 3, 'early_leave', 'auto', 100, 500),    -- سقف الأجر اليومي: 50,000 × 500 ÷ 100 = 250,000 ⇒ 50,000
    (e1, m + 4, 'incomplete',  'auto', 720, 100),    -- البصمة الناقصة لا تُستقطع ولو كان نقصها كبيراً
    (e1, m + 5, 'early_leave', 'auto', 0, 100),      -- المطلوب صفر ⇒ لا قسمة على صفر ولا استقطاع
    (e1, m + 6, 'late',        'auto', 720, 0),      -- متأخر بلا نقص ⇒ يُدفع
    (e1, m + 7, 'time_permit', 'auto', 720, 0),      -- زمنية ⇒ تُدفع
    (e1, m + 8, 'present',     'auto', 720, 0),
    (e1, m + 9, 'leave',       'manual', 0, 0);      -- إجازة معتمدة ⇒ تُحجب
end $$;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000004');
select (public.ops_contractor_month_approve('2025-05-01', 'follow_up', true)).approved_source;
select pg_temp.as_user('c0d00000-0000-4000-8000-000000000002');
do $$ declare r record; c1 uuid := 'c0d00000-0000-4000-8000-000000000011'; m date := '2025-05-01'; begin
  perform public.finance_contractor_rates_set(c1, m, 50000, 30000, null);
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m;
  assert r.state = 'paid' and r.shortfall_minutes = 16 and r.deduct_minutes = 16 and r.deduction = 1111 and r.day_pay = 48889, 'CW12 16 over grace: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 1;
  assert r.shortfall_minutes = 15 and r.deduct_minutes = 0 and r.deduction = 0 and r.day_pay = 50000, 'CW12 15 at grace: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 2;
  assert r.required_minutes = 480 and r.deduct_minutes = 30 and r.deduction = 3125 and r.day_pay = 46875, 'CW12 divisor is the day required minutes: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 3;
  assert r.deduct_minutes = 500 and r.deduction = 50000 and r.day_pay = 0 and r.state = 'paid', 'CW12 capped at the daily wage: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 4;
  assert r.state = 'paid' and r.deduct_minutes = 0 and r.deduction = 0 and r.day_pay = 50000, 'CW12 incomplete never deducted: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 5;
  assert r.state = 'paid' and r.deduct_minutes = 0 and r.deduction = 0 and r.day_pay = 50000, 'CW12 zero required: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 6;
  assert r.state = 'paid' and r.day_pay = 50000, 'CW12 late is paid: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 7;
  assert r.state = 'paid' and r.day_pay = 50000, 'CW12 time_permit is paid: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 9;
  assert r.state = 'blocked' and r.block_reason = 'leave' and r.day_pay = 0, 'CW12 leave blocked: ' || row_to_json(r)::text;
  -- كل الأيام تحمل سبباً صريحاً: لا يوم محجوب بلا سبب ولا مدفوع بسبب
  assert not exists (select 1 from public.finance_contractor_wage_days_adjusted(c1, m) x where (x.state = 'blocked' and x.block_reason is null) or (x.state = 'paid' and x.block_reason is not null)), 'CW12 reasons are consistent';
  raise notice 'CW12a ✅ الحالات السبع + الحد والسقف والمطلوب المتغيّر';
end $$;

-- ═══ CW13 · قاعدة الاستقطاع قابلة للتخصيص: سماح 30 للمتعهد، ثم استثناؤه، ثم تعطيل استقطاع النقص ═══
do $$ declare r record; c1 uuid := 'c0d00000-0000-4000-8000-000000000011'; e1 uuid := 'c0d00000-0000-4000-8000-0000000000e1'; rid uuid; m date := '2025-05-01'; begin
  -- قاعدة خاصة بموظف المتعهد: سماح 30 دقيقة (يوم النقص 16 يصبح ضمن السماح، ويوم النقص 30 عند حده، ويوم النقص 500 ما زال فوقه)
  insert into public.hr_deduction_rules (name, is_default, is_active, settings) values ('cw سماح 30', false, true, jsonb_build_object('grace_minutes_default', 30, 'auto_deduction_enabled', true, 'deduct_shortfall_enabled', true)) returning id into rid;
  insert into public.hr_deduction_rule_targets (rule_id, target_type, target_id) values (rid, 'employee', e1);
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m;
  assert r.grace_minutes = 30 and r.deduct_minutes = 0 and r.deduction = 0 and r.day_pay = 50000, 'CW13 custom grace 30 covers 16: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 2;
  assert r.shortfall_minutes = 30 and r.grace_minutes = 30 and r.deduct_minutes = 0 and r.deduction = 0, 'CW13 30 at the custom grace: ' || row_to_json(r)::text;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 3;
  assert r.grace_minutes = 30 and r.deduct_minutes = 500 and r.deduction = 50000, 'CW13 500 still above: ' || row_to_json(r)::text;
  -- سماح 5: يوم النقص 15 صار فوقه ⇒ يُستقطع 15: 50,000 × 15 ÷ 720 = 1,041.67 ⇒ 1,042
  update public.hr_deduction_rules set settings = jsonb_set(settings, '{grace_minutes_default}', '5') where id = rid;
  select * into r from public.finance_contractor_wage_days_adjusted(c1, m) where log_date = m + 1;
  assert r.grace_minutes = 5 and r.deduct_minutes = 15 and r.deduction = 1042 and r.day_pay = 48958, 'CW13 grace 5: ' || row_to_json(r)::text;
  -- تعطيل استقطاع النقص في القاعدة ⇒ لا استقطاع أبداً (الحجب بالغياب مستقل عنه)
  update public.hr_deduction_rules set settings = settings || '{"deduct_shortfall_enabled": false}'::jsonb where id = rid;
  assert (select sum(deduction) from public.finance_contractor_wage_days_adjusted(c1, m)) = 0, 'CW13 deduct_shortfall_enabled=false ⇒ no deduction';
  assert (select count(*) from public.finance_contractor_wage_days_adjusted(c1, m) where state = 'blocked') = 1, 'CW13 blocking is independent of the deduction switch';
  update public.hr_deduction_rules set settings = settings || '{"deduct_shortfall_enabled": true, "auto_deduction_enabled": false}'::jsonb where id = rid;
  assert (select sum(deduction) from public.finance_contractor_wage_days_adjusted(c1, m)) = 0, 'CW13 auto_deduction_enabled=false ⇒ no deduction';
  update public.hr_deduction_rules set settings = settings || '{"auto_deduction_enabled": true}'::jsonb where id = rid;
  assert (select sum(deduction) from public.finance_contractor_wage_days_adjusted(c1, m)) > 0, 'CW13 re-enabled';
  -- استثناء المتعهد نفسه من الاستقطاعات (وحدة الاستثناءات) ⇒ لا استقطاع
  delete from public.hr_deduction_rule_targets where rule_id = rid;
  assert (select sum(deduction) from public.finance_contractor_wage_days_adjusted(c1, m)) = 1111 + 3125 + 50000, 'CW13 back to the default rule (grace 15): 16 + 30 + 500 minutes';
  insert into public.hr_deduction_exemptions (target_type, target_id, reason, from_date) values ('employee', e1, 'cw استثناء', '2025-01-01');
  assert (select sum(deduction) from public.finance_contractor_wage_days_adjusted(c1, m)) = 0, 'CW13 exempt contractor is not deducted';
  raise notice 'CW13 ✅ السماح قابل للتخصيص والاستثناء والتعطيل يُحترمان';
end $$;
alter table public.hr_attendance_days enable trigger trg_hr_attendance_metrics;

-- ═══ CW14 · الامتيازات: الدوال الداخلية لا تُنادى من الواجهة، والعامة للمسجَّلين فقط ═══
do $$ begin
  assert not has_function_privilege('authenticated', 'app.contractor_wage_days(date, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.contractor_wages_state(date)', 'execute')
     and not has_function_privilege('authenticated', 'app.disbursement_open_contractors(date, text, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.finance_contractor_wages_close__raw(date, text)', 'execute'), 'CW14 internal functions are not callable by authenticated';
  assert has_function_privilege('authenticated', 'public.finance_contractor_wages_readiness(date)', 'execute') and has_function_privilege('authenticated', 'public.finance_contractor_wages_close(date, text)', 'execute')
     and not has_function_privilege('anon', 'public.finance_contractor_wages_readiness(date)', 'execute') and not has_function_privilege('anon', 'public.finance_contractor_wages_close(date, text)', 'execute'), 'CW14 public functions: authenticated only';
  assert (select count(*) from public.permission_write_bindings where (fn, unit_key, action) in (('finance_contractor_wages_close', 'finance.contractor-wages', 'decide'), ('disbursement_decide', 'admin.disbursements', 'decide'),
           ('disbursement_pay', 'finance.disbursements', 'execute'), ('disbursement_resubmit', 'finance.disbursements', 'create'))) = 4, 'CW14 write bindings';
  raise notice 'CW14 ✅ الامتيازات والربط';
end $$;

do $$ begin raise notice 'CONTRACTOR_WAGES_DISBURSEMENT_OK'; end $$;
rollback;
