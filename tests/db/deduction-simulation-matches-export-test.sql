-- 00202 · محاكاة الاستقطاعات (التطوير المركزية) تطابق محرّك التصدير: أجر اليوم = الأساسي ÷ أيام الشهر الفعلية، والغياب غير مدفوع لا مستقطع
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('d2000000-0000-0000-0000-000000000008', 'ds-it@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('d2000000-0000-0000-0000-000000000008', 'it_admin') on conflict do nothing;
select auth.set_test_user('d2000000-0000-0000-0000-000000000008');

-- S1 · النموذج الافتراضي (الأيام المستحقة): أيام الشهر الفعلية + الغياب = 0 استقطاع
do $$ declare j jsonb; dim int := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int; begin
  j := public.it_deduction_simulate(null, 0, 480, 500000, 3, 1);
  assert j ->> 'salary_model' = 'earned_days', 'S1 model: ' || j::text;
  assert (j ->> 'days_in_month')::int = dim, 'S1 dim';
  assert (j ->> 'day_rate')::numeric = round(500000.0 / dim, 4), 'S1 day_rate: ' || (j ->> 'day_rate');
  assert (j ->> 'absent_days')::numeric = 0 and (j ->> 'amount')::numeric = 0, 'S1 absence is unpaid not deducted: ' || j::text;
  -- النقص يبقى مستقطعاً بأجر الدقيقة الصحيح
  j := public.it_deduction_simulate(jsonb_build_object('shortfall_method', 'actual'), 60, 480, 500000, 0, 0);
  assert (j ->> 'minutes')::int = 60 and (j ->> 'amount')::numeric = round(round(round(500000.0 / dim, 4) / 480, 4) * 60, 2), 'S1 shortfall amount: ' || j::text;
  raise notice 'S1 ✅ المحاكاة البسيطة تطابق النموذج';
end $$;

-- S2 · المحاكاة التفصيلية بشهر محدد: 31 يوماً ⇒ 500000 ÷ 31؛ غياب 9 أيام ⇒ unpaid_days_amount لا amount
do $$ declare j jsonb; begin
  j := public.it_deduction_simulate_v2(null, jsonb_build_object('month', '2026-10-01', 'base_salary', 500000, 'shift_minutes', 480, 'absent_days', 9, 'late_minutes', 0, 'early_minutes', 0, 'paid_leave_days', 2));
  assert (j ->> 'days_in_month')::int = 31 and (j ->> 'day_rate')::numeric = round(500000.0 / 31, 4), 'S2 rate: ' || (j ->> 'day_rate');
  assert (j ->> 'amount')::numeric = 0 and (j ->> 'absent_days')::numeric = 0, 'S2 no absence deduction: ' || j::text;
  assert (j ->> 'unpaid_days_amount')::numeric = round(round(500000.0 / 31, 4) * 9, 2), 'S2 unpaid amount: ' || (j ->> 'unpaid_days_amount');
  assert exists (select 1 from jsonb_array_elements(j -> 'steps') st where st ->> 'key' = 'days' and st ->> 'text' like '%غير مدفوعة أصلاً%'), 'S2 explanation step';
  assert exists (select 1 from jsonb_array_elements(j -> 'steps') st where st ->> 'key' = 'rates' and st ->> 'text' like '%÷ أيام الشهر 31%'), 'S2 rates step';
  -- شهر 28 يوماً
  j := public.it_deduction_simulate_v2(null, jsonb_build_object('month', '2027-02-01', 'base_salary', 500000, 'shift_minutes', 480, 'absent_days', 0));
  assert (j ->> 'days_in_month')::int = 28 and (j ->> 'day_rate')::numeric = round(500000.0 / 28, 4), 'S2 feb';
  -- اليومي لا يتأثر
  j := public.it_deduction_simulate_v2(null, jsonb_build_object('month', '2026-10-01', 'pay_type', 'daily', 'base_salary', 25000, 'shift_minutes', 480, 'absent_days', 2));
  assert (j ->> 'salary_model') = 'daily' and (j ->> 'day_rate')::numeric = 25000, 'S2 daily';
  raise notice 'S2 ✅ المحاكاة التفصيلية تطابق النموذج';
end $$;

-- S3 · النموذج القديم يبقى كما كان (÷ 30 + خصم الغياب)
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence"}'::jsonb where id = 1;
select auth.set_test_user('d2000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; begin
  j := public.it_deduction_simulate(null, 0, 480, 600000, 1, 0);
  assert (j ->> 'day_rate')::numeric = 20000 and (j ->> 'amount')::numeric = 20000 and j ->> 'salary_model' = 'full_minus_absence', 'S3 legacy: ' || j::text;
  j := public.it_deduction_simulate_v2(null, jsonb_build_object('base_salary', 600000, 'shift_minutes', 480, 'absent_days', 1));
  assert (j ->> 'day_rate')::numeric = 20000 and (j ->> 'amount_absence')::numeric = 20000, 'S3 legacy v2: ' || j::text;
  raise notice 'S3 ✅ النموذج القديم بلا تغيير';
end $$;
reset role; select set_config('auth.user_id','', false);
