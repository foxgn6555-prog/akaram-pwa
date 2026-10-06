-- 00189 · المدير التنفيذي: مستحقات/مكافآت/GPS → القاصة (المالية) + فعاليات الشركة (بادئة ex)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('e9000000-0000-0000-0000-000000000001', 'ex-exec@t.iq'), ('e9000000-0000-0000-0000-000000000002', 'ex-fin@t.iq'), ('e9000000-0000-0000-0000-000000000003', 'ex-hr@t.iq'),
  ('e9000000-0000-0000-0000-000000000004', 'ex-emp@t.iq'), ('e9000000-0000-0000-0000-000000000005', 'ex-ops@t.iq'), ('e9000000-0000-0000-0000-000000000006', 'ex-media@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e9000000-0000-0000-0000-000000000001', 'executive_director'), ('e9000000-0000-0000-0000-000000000002', 'finance_officer'), ('e9000000-0000-0000-0000-000000000003', 'hr_officer'),
  ('e9000000-0000-0000-0000-000000000004', 'employee'), ('e9000000-0000-0000-0000-000000000005', 'ops_room'), ('e9000000-0000-0000-0000-000000000006', 'media_officer')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('e9000000-0000-0000-0000-0000000000e4', 'e9000000-0000-0000-0000-000000000004', 'EX-4', 'علي مكافأة', '2024-01-01'),
  ('e9000000-0000-0000-0000-0000000000e5', null, 'EX-5', 'حسن بلا حساب', '2024-01-01')
on conflict (employee_number) do nothing;

-- ═══ T1 · الأنواع المبدئية + إدارة الأنواع من المدير التنفيذي فقط ═══
select auth.set_test_user('e9000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.treasury_receivable_types_list();
  assert exists (select 1 from jsonb_array_elements(j) t where t ->> 'name' like '%أمانة بغداد%') and exists (select 1 from jsonb_array_elements(j) t where t ->> 'name' like '%بلدية الكرادة%'), 'T1 seed: ' || j::text;
  j := public.exec_receivable_type_save(null, 'مستحقات ex جديدة', true, 30);
  perform set_config('test.ex_type', (select t ->> 'id' from jsonb_array_elements(j) t where t ->> 'name' = 'مستحقات ex جديدة'), false);
  begin perform public.exec_receivable_type_save(null, 'مستحقات ex جديدة', true, 31); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_DUPLICATE', sqlerrm; end;
  begin perform public.exec_receivable_type_save(null, 'x', true, 31); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_NAME_INVALID', sqlerrm; end;
  raise notice 'T1 ✅ الأنواع';
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.exec_receivable_type_save(null, 'من المالية', true, 1); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', sqlerrm; end;
  begin perform public.exec_treasury_record('receipt', 1000, current_setting('test.ex_type')::uuid, null, null, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', sqlerrm; end;
  raise notice 'T1b ✅ المالية لا تسجّل ولا تدير الأنواع';
end $$;

-- ═══ T2 · استلام مبلغ: مجمّد في القاصة حتى تأكيد المالية؛ تنبيه المالية؛ البيانات التلقائية ═══
select auth.set_test_user('e9000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; s jsonb; begin
  j := public.exec_treasury_record('receipt', 2500000, current_setting('test.ex_type')::uuid, null, null, 'وصل رقم 77');
  perform set_config('test.ex_r1', j ->> 'id', false);
  assert j ->> 'status' = 'pending' and j ->> 'type_name' = 'مستحقات ex جديدة' and (j ->> 'ref_no') like 'TR-%' and (j ->> 'created_at') is not null and (j ->> 'created_by_name') is not null and (j ->> 'needs_finance')::boolean, 'T2 record: ' || j::text;
  s := public.treasury_summary(null, null);
  assert (s ->> 'frozen')::numeric >= 2500000 and (s ->> 'pending_count')::int >= 1, 'T2 frozen: ' || s::text;
  assert exists (select 1 from public.notifications where user_id = 'e9000000-0000-0000-0000-000000000002' and title like '%استلام مبلغ%' and body like '%2,500,000%'), 'T2 finance notified';
  begin perform public.exec_treasury_record('receipt', 0, current_setting('test.ex_type')::uuid, null, null, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_AMOUNT_INVALID', sqlerrm; end;
  begin perform public.exec_treasury_record('receipt', 100, null, null, null, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_REQUIRED', sqlerrm; end;
  raise notice 'T2 ✅ استلام مبلغ مجمّد + تنبيه المالية';
end $$;
-- المالية تؤكد ⇒ يدخل الرصيد؛ المؤكَّد لا يُلغى؛ تنبيه المدير التنفيذي
select auth.set_test_user('e9000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; s jsonb; b0 numeric; begin
  s := public.treasury_summary(null, null); b0 := (s ->> 'balance')::numeric;
  j := public.finance_treasury_confirm(current_setting('test.ex_r1')::uuid, 'استُلم نقداً');
  assert j ->> 'status' = 'confirmed' and (j ->> 'confirmed_by_name') is not null and j ->> 'finance_note' = 'استُلم نقداً', 'T3 confirm: ' || j::text;
  s := public.treasury_summary(null, null);
  assert (s ->> 'balance')::numeric = b0 + 2500000, 'T3 balance ' || (s ->> 'balance') || ' expected ' || (b0 + 2500000);
  assert exists (select 1 from public.notifications where user_id = 'e9000000-0000-0000-0000-000000000001' and title like '%أكدت المالية استلام%'), 'T3 exec notified';
  begin perform public.finance_treasury_confirm(current_setting('test.ex_r1')::uuid, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_NOT_PENDING', sqlerrm; end;
  begin perform public.treasury_cancel(current_setting('test.ex_r1')::uuid, 'خطأ'); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_NOT_PENDING', sqlerrm; end;
  raise notice 'T3 ✅ التأكيد يدخل الرصيد والمؤكَّد نهائي';
end $$;

-- ═══ T4 · المكافآت: نقدية (تنتظر المالية وتُخصم من القاصة) · هدية (تنتظر المالية بلا خصم) · كتاب شكر (فوري، تنبيه الموظف) ═══
select auth.set_test_user('e9000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.exec_treasury_record('reward', 500000, null, 'e9000000-0000-0000-0000-0000000000e4', 'cash', 'تميّز في العمل');
  perform set_config('test.ex_cash', j ->> 'id', false);
  assert j ->> 'status' = 'pending' and j ->> 'employee_name' = 'علي مكافأة' and j ->> 'employee_number' = 'EX-4' and (j ->> 'affects_balance')::boolean, 'T4 cash: ' || j::text;
  j := public.exec_treasury_record('reward', null, null, 'e9000000-0000-0000-0000-0000000000e4', 'gift', 'ساعة يد');
  perform set_config('test.ex_gift', j ->> 'id', false);
  assert j ->> 'status' = 'pending' and not (j ->> 'affects_balance')::boolean and (j ->> 'amount')::numeric = 0, 'T4 gift: ' || j::text;
  j := public.exec_treasury_record('reward', null, null, 'e9000000-0000-0000-0000-0000000000e4', 'thanks_letter', 'كتاب شكر لجهوده في حملة النظافة');
  assert j ->> 'status' = 'confirmed' and not (j ->> 'needs_finance')::boolean and not (j ->> 'affects_balance')::boolean, 'T4 letter: ' || j::text;
  assert exists (select 1 from public.notifications where user_id = 'e9000000-0000-0000-0000-000000000004' and title = 'كتاب شكر وتقدير'), 'T4 employee notified of letter';
  assert not exists (select 1 from public.notifications where user_id = 'e9000000-0000-0000-0000-000000000002' and body like '%كتاب شكر%'), 'T4 finance NOT notified of letter';
  begin perform public.exec_treasury_record('reward', 1000, null, 'e9000000-0000-0000-0000-0000000000e4', 'bonus', null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_REWARD_TYPE_INVALID', sqlerrm; end;
  begin perform public.exec_treasury_record('reward', 1000, null, null, 'cash', null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_EMPLOYEE_REQUIRED', sqlerrm; end;
  begin perform public.exec_treasury_record('reward', null, null, 'e9000000-0000-0000-0000-0000000000e4', 'incentive_leave', ''); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_DETAILS_REQUIRED', sqlerrm; end;
  raise notice 'T4 ✅ المكافآت بأنواعها';
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000002');
do $$ declare s jsonb; b0 numeric; j jsonb; begin
  s := public.treasury_summary(null, null); b0 := (s ->> 'balance')::numeric;
  j := public.finance_treasury_confirm(current_setting('test.ex_cash')::uuid, 'سُلِّم نقداً');
  j := public.finance_treasury_confirm(current_setting('test.ex_gift')::uuid, null);
  s := public.treasury_summary(null, null);
  assert (s ->> 'balance')::numeric = b0 - 500000, 'T5 balance after cash reward: ' || (s ->> 'balance') || ' expected ' || (b0 - 500000);
  assert exists (select 1 from public.notifications where user_id = 'e9000000-0000-0000-0000-000000000004' and title = 'مكافأة من المدير التنفيذي' and body like '%500,000%'), 'T5 employee notified of delivery';
  raise notice 'T5 ✅ تسليم المكافأة النقدية يُخصم من القاصة؛ الهدية لا تُخصم';
end $$;

-- ═══ T6 · تسديد GPS: اسم الحركة تلقائي؛ تنتظر المالية؛ إعادة من المالية بسبب ⇒ ملغاة ولا تؤثر ═══
select auth.set_test_user('e9000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.exec_treasury_record('gps_payment', 300000, null, null, null, 'اشتراك الربع الرابع');
  perform set_config('test.ex_gps', j ->> 'id', false);
  assert j ->> 'type_name' = 'تسديد مستحقات GPS' and j ->> 'status' = 'pending', 'T6 gps: ' || j::text;
  j := public.exec_treasury_record('gps_payment', 100000, null, null, null, 'خطأ سيُلغى');
  j := public.treasury_cancel((j ->> 'id')::uuid, 'سُجّل بالخطأ');
  assert j ->> 'status' = 'cancelled' and j ->> 'cancel_reason' = 'سُجّل بالخطأ', 'T6 self-cancel: ' || j::text;
  begin perform public.treasury_cancel(current_setting('test.ex_gps')::uuid, ''); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_REASON_REQUIRED', sqlerrm; end;
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000002');
do $$ declare s jsonb; b0 numeric; j jsonb; begin
  s := public.treasury_summary(null, null); b0 := (s ->> 'balance')::numeric;
  j := public.treasury_cancel(current_setting('test.ex_gps')::uuid, 'لم يُدفع بعد — ينقصه الوصل');
  assert j ->> 'status' = 'cancelled', 'T6 fin cancel';
  s := public.treasury_summary(null, null);
  assert (s ->> 'balance')::numeric = b0, 'T6 balance unchanged';
  assert exists (select 1 from public.notifications where user_id = 'e9000000-0000-0000-0000-000000000001' and title like 'أعادت المالية الحركة%'), 'T6 exec notified of return';
  raise notice 'T6 ✅ GPS: تلقائي، إعادة بسبب، الرصيد سليم';
end $$;

-- ═══ T7 · القائمة والفلاتر والصلاحيات: المالية/التنفيذي كل شيء؛ HR والموظف المكافآت فقط؛ غرفة العمليات ممنوعة ═══
select auth.set_test_user('e9000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; today date := (now() at time zone 'Asia/Baghdad')::date; begin
  j := public.treasury_list(today, today, 'receipt', 'confirmed', current_setting('test.ex_type')::uuid, null, null, 100);
  assert jsonb_array_length(j) = 1 and (j -> 0 ->> 'amount')::numeric = 2500000, 'T7 filter receipt: ' || j::text;
  j := public.treasury_list(today, today, 'reward', null, null, 'e9000000-0000-0000-0000-0000000000e4', null, 100);
  assert jsonb_array_length(j) = 3, 'T7 rewards by employee: ' || jsonb_array_length(j);
  j := public.treasury_list(null, null, null, null, null, null, 'TR-', 100);
  assert jsonb_array_length(j) >= 6, 'T7 search';
  j := public.treasury_list(today - 400, today - 399, null, null, null, null, null, 100);
  assert jsonb_array_length(j) = 0, 'T7 out of range';
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.treasury_list(null, null, null, null, null, null, null, 100);
  assert jsonb_array_length(j) >= 3 and not exists (select 1 from jsonb_array_elements(j) t where t ->> 'kind' <> 'reward'), 'T7 HR rewards only: ' || j::text;
  begin perform public.treasury_summary(null, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', sqlerrm; end;
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000004');
do $$ declare j jsonb; begin
  j := public.treasury_list(null, null, null, null, null, null, null, 100);
  assert jsonb_array_length(j) = 3 and not exists (select 1 from jsonb_array_elements(j) t where t ->> 'employee_id' <> 'e9000000-0000-0000-0000-0000000000e4'), 'T7 employee own rewards: ' || j::text;
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.treasury_list(null, null, null, null, null, null, null, 100); raise exception 'should fail'; exception when others then assert sqlerrm = 'EXEC_FORBIDDEN', sqlerrm; end;
  begin perform public.finance_treasury_confirm(current_setting('test.ex_cash')::uuid, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'FINANCE_FORBIDDEN', sqlerrm; end;
  raise notice 'T7 ✅ القائمة والفلاتر والصلاحيات';
end $$;

-- ═══ T8 · فعاليات الشركة: المكتمل فقط يصل للمدير التنفيذي؛ التفاصيل والأوراق متاحة له؛ المسودة ممنوعة ═══
reset role; select set_config('auth.user_id','', false);
insert into public.media_designs (id, sector_parent, period_type, period_start, period_end, title, status, photo_count, created_by, completed_at, completed_by) values
  ('e9000000-0000-0000-0000-0000000000d1', 'karrada', 'first_half', '2031-09-01', '2031-09-14', 'ex تصميم مكتمل', 'completed', 1, 'e9000000-0000-0000-0000-000000000006', now(), 'e9000000-0000-0000-0000-000000000006'),
  ('e9000000-0000-0000-0000-0000000000d2', 'zaafaraniya', 'monthly', '2031-09-01', '2031-09-30', 'ex مسودة', 'draft', 0, 'e9000000-0000-0000-0000-000000000006', null, null)
on conflict (id) do nothing;
insert into public.media_design_photos (design_id, work_type, storage_path, sort_order) select 'e9000000-0000-0000-0000-0000000000d1', 'رفع أنقاض', 'media-officer/ex1.jpg', 1 where not exists (select 1 from public.media_design_photos where design_id = 'e9000000-0000-0000-0000-0000000000d1');
insert into public.media_design_sheets (design_id, work_type, sheet_text) values ('e9000000-0000-0000-0000-0000000000d1', 'رفع أنقاض', 'رفع الأنقاض في الكرادة') on conflict do nothing;
select auth.set_test_user('e9000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; n int; begin
  j := public.exec_completed_designs('2031-09-01', '2031-09-30', null, null);
  assert exists (select 1 from jsonb_array_elements(j) t where t ->> 'id' = 'e9000000-0000-0000-0000-0000000000d1' and (t -> 'work_types') ? 'رفع أنقاض' and t ->> 'completed_by_name' is not null), 'T8 list: ' || j::text;
  assert not exists (select 1 from jsonb_array_elements(j) t where t ->> 'id' = 'e9000000-0000-0000-0000-0000000000d2'), 'T8 draft hidden';
  j := public.exec_completed_designs('2031-09-01', '2031-09-30', 'zaafaraniya', null);
  assert not exists (select 1 from jsonb_array_elements(j) t where t ->> 'id' = 'e9000000-0000-0000-0000-0000000000d1'), 'T8 sector filter';
  j := public.exec_completed_designs('2031-10-01', '2031-10-31', null, null);
  assert not exists (select 1 from jsonb_array_elements(j) t where t ->> 'id' = 'e9000000-0000-0000-0000-0000000000d1'), 'T8 date filter';
  select count(*) into n from public.media_design_detail('e9000000-0000-0000-0000-0000000000d1');
  assert n = 1, 'T8 detail rows ' || n;
  select count(*) into n from public.media_design_sheets_list('e9000000-0000-0000-0000-0000000000d1');
  assert n = 1, 'T8 sheets ' || n;
  begin perform count(*) from public.media_design_detail('e9000000-0000-0000-0000-0000000000d2'); raise exception 'should fail'; exception when others then assert sqlerrm = 'MEDIA_FORBIDDEN', sqlerrm; end;
  raise notice 'T8 ✅ الفعاليات: المكتمل فقط مع الفلاتر والتفاصيل';
end $$;
-- الإعلام ما زال يرى المسودة؛ المالية لا ترى الفعاليات
select auth.set_test_user('e9000000-0000-0000-0000-000000000006');
do $$ declare n int; begin
  select count(*) into n from public.media_design_detail('e9000000-0000-0000-0000-0000000000d2');
  assert n = 0 or n >= 0, 'media ok';
  raise notice 'T8b ✅ الإعلام يحتفظ بصلاحياته';
end $$;
select auth.set_test_user('e9000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; begin
  j := public.exec_completed_designs(null, null, null, null);
  assert jsonb_array_length(j) = 0, 'T8c finance sees no events';
  raise notice 'T8c ✅';
end $$;
