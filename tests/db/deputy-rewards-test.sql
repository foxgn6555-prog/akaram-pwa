-- 00203 · المكافآت لمعاون المدير المفوض: نفس صلاحيات التنفيذي على المكافآت فقط (بادئة dp)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00307: القاصة يجب أن تغطي الصرف النقدي — تمويل أولي للاختبار
insert into auth.users (id, email) values ('5eed0000-0000-0000-0000-000000000001', 'treasury-seed@t.iq') on conflict (id) do nothing;
insert into public.treasury_transactions (ref_no, kind, amount, type_name, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at) values ('TR-SEED-'||gen_random_uuid()::text, 'receipt', 1000000000, 'تمويل اختبار', 'confirmed', true, '5eed0000-0000-0000-0000-000000000001', 'seed', '5eed0000-0000-0000-0000-000000000001', now());
insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'dp-dep@t.iq'), ('dd000000-0000-0000-0000-000000000002', 'dp-fin@t.iq'), ('dd000000-0000-0000-0000-000000000003', 'dp-exec@t.iq'), ('dd000000-0000-0000-0000-000000000004', 'dp-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('dd000000-0000-0000-0000-000000000001', 'deputy_director'), ('dd000000-0000-0000-0000-000000000002', 'finance_officer'), ('dd000000-0000-0000-0000-000000000003', 'executive_director'), ('dd000000-0000-0000-0000-000000000004', 'employee')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('dd000000-0000-0000-0000-0000000000e4', 'dd000000-0000-0000-0000-000000000004', 'DP-4', 'سعد مكافأة معاون', '2024-01-01')
on conflict (employee_number) do nothing;

-- ═══ D1 · المعاون: يبحث عن موظف، يسجّل نقدية (تنتظر المالية) وكتاب شكر (فوري، يُذكر فيه «معاون المدير المفوض»)؛ لا يسجّل مستحقات/GPS ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.exec_employee_lookup('سعد');
  assert exists (select 1 from jsonb_array_elements(j) e where e ->> 'employee_number' = 'DP-4'), 'D1 lookup: ' || j::text;
  j := public.exec_treasury_record('reward', 250000, null, 'dd000000-0000-0000-0000-0000000000e4', 'cash', 'تميّز');
  perform set_config('test.dp_cash', j ->> 'id', false);
  assert j ->> 'status' = 'pending' and (j ->> 'needs_finance')::boolean and j ->> 'employee_number' = 'DP-4', 'D1 cash: ' || j::text;
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000002' and body like '%' || (j ->> 'ref_no') || '%'), 'D1 finance notified';
  j := public.exec_treasury_record('reward', null, null, 'dd000000-0000-0000-0000-0000000000e4', 'thanks_letter', 'جهود مميزة');
  assert j ->> 'status' = 'confirmed', 'D1 letter';
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000004' and title = 'كتاب شكر وتقدير' and body like '%معاون المدير المفوض%'), 'D1 employee notified with deputy label';
  begin perform public.exec_treasury_record('gps_payment', 1000, null, null, null, 'x'); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', 'D1 gps: ' || sqlerrm; end;
  begin perform public.exec_receivable_type_save(null, 'نوع من المعاون', true, 5); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', 'D1 types: ' || sqlerrm; end;
  raise notice 'D1 ✅ المعاون يسجّل المكافآت فقط';
end $$;

-- ═══ D2 · القائمة والملخص: المعاون يرى كل المكافآت (حتى مكافآت التنفيذي) ولا يرى المستحقات ولا رصيد القاصة ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.exec_treasury_record('reward', 100000, null, 'dd000000-0000-0000-0000-0000000000e4', 'cash', 'من التنفيذي');
  perform set_config('test.dp_exec_cash', j ->> 'id', false);
  j := public.exec_treasury_record('gps_payment', 777000, null, null, null, 'تسديد gps');
end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; s jsonb; begin
  j := public.treasury_list(null, null, null, null, null, null, null, 500);
  assert exists (select 1 from jsonb_array_elements(j) t where t ->> 'id' = current_setting('test.dp_exec_cash')), 'D2 sees exec reward';
  assert not exists (select 1 from jsonb_array_elements(j) t where t ->> 'kind' <> 'reward'), 'D2 rewards only: ' || j::text;
  s := public.treasury_summary(null, null);
  assert (s -> 'range' ->> 'rewards_count')::int >= 3 and s ? 'rewards_by_type' and not (s ? 'balance') and not (s -> 'range' ? 'gps_confirmed'), 'D2 summary subset: ' || s::text;
  raise notice 'D2 ✅ القائمة والملخص محصوران بالمكافآت';
end $$;
-- RLS المباشر (دور authenticated): المعاون يرى المكافآت فقط
set role authenticated;
do $$ begin
  assert (select count(*) from public.treasury_transactions where kind = 'gps_payment' and amount = 777000) = 0, 'D2 RLS hides gps';
  assert (select count(*) from public.treasury_transactions where kind = 'reward') >= 3, 'D2 RLS shows rewards';
end $$;
reset role;
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');

-- ═══ D3 · الإلغاء: المعاون يلغي مكافأته المعلّقة بسبب (المالية تُبلَّغ بصفته)؛ لا يلغي مستحقاً؛ المالية تعيد مكافأة المعاون ⇒ الإشعار يصل للمعاون برابط بوابته ═══
do $$ declare j jsonb; begin
  j := public.exec_treasury_record('reward', 50000, null, 'dd000000-0000-0000-0000-0000000000e4', 'cash', 'سيُلغى');
  j := public.treasury_cancel((j ->> 'id')::uuid, 'سُجّلت بالخطأ');
  assert j ->> 'status' = 'cancelled', 'D3 cancel own';
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000002' and title like 'ألغى معاون المدير المفوض%'), 'D3 finance notified with deputy label';
  raise notice 'D3a ✅';
end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin j := public.exec_treasury_record('receipt', 90000, (select id from public.treasury_receivable_types where is_active limit 1), null, null, 'وصل'); perform set_config('test.dp_receipt', j ->> 'id', false); end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.treasury_cancel(current_setting('test.dp_receipt')::uuid, 'محاولة'); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', 'D3 receipt cancel: ' || sqlerrm; end;
  raise notice 'D3b ✅ لا يلغي المستحقات';
end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; begin
  j := public.treasury_cancel(current_setting('test.dp_cash')::uuid, 'الموظف غير موجود للتسليم');
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000001' and link = '/deputy/rewards' and title like 'أعادت المالية%'), 'D3 deputy notified at /deputy/rewards';
  assert not exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000003' and body like '%' || (j ->> 'ref_no') || '%' and title like 'أعادت المالية%'), 'D3 exec not spammed for deputy reward';
  -- تسليم مكافأة التنفيذي ⇒ إشعار التنفيذي كما كان، والموظف يعرف أنها من المدير التنفيذي
  j := public.finance_treasury_confirm(current_setting('test.dp_exec_cash')::uuid, null);
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000003' and link = '/executive/rewards' and title = 'سلّمت المالية المكافأة'), 'D3 exec notified';
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000004' and title = 'مكافأة من المدير التنفيذي'), 'D3 employee label exec';
  raise notice 'D3 ✅ الإشعارات تصل لصاحب الحركة';
end $$;
-- تسليم مكافأة من المعاون ⇒ الموظف يعرف أنها من المعاون
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin j := public.exec_treasury_record('reward', null, null, 'dd000000-0000-0000-0000-0000000000e4', 'gift', 'درع تقدير'); perform set_config('test.dp_gift', j ->> 'id', false); end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; begin
  j := public.finance_treasury_confirm(current_setting('test.dp_gift')::uuid, 'سُلّم');
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000001' and link = '/deputy/rewards' and title = 'سلّمت المالية المكافأة'), 'D4 deputy notified on delivery';
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000004' and title = 'مكافأة من معاون المدير المفوض'), 'D4 employee label deputy';
  raise notice 'D4 ✅ التسليم يبلّغ المعاون والموظف بالصفة الصحيحة';
end $$;
reset role; select set_config('auth.user_id','', false);
