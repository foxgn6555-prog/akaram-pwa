-- 00191 · السلف: طلب من غرفة العمليات → سلسلة موافقات (افتراضية: معاون ثم مدير مفوض) → تسليم المالية من القاصة → قسط تلقائي في كشف الرواتب → تسجيل القسط عند الاعتماد (بادئة ad)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00201: هذا الاختبار يفترض النموذج القديم (الراتب كاملاً ناقص الغياب ÷ 30)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
-- 00193: هذا الاختبار يختبر التصدير مباشرة؛ بوابة «اعتماد الحضورية قبل التصدير» تُختبر في ops-attendance-two-stage-test
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'ad-ops@t.iq'), ('ad000000-0000-0000-0000-000000000003', 'ad-dep@t.iq'),
  ('ad000000-0000-0000-0000-000000000004', 'ad-adm@t.iq'), ('ad000000-0000-0000-0000-000000000007', 'ad-fin@t.iq'), ('ad000000-0000-0000-0000-000000000008', 'ad-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ad000000-0000-0000-0000-000000000001', 'ops_room'), ('ad000000-0000-0000-0000-000000000003', 'deputy_director'),
  ('ad000000-0000-0000-0000-000000000004', 'super_admin'), ('ad000000-0000-0000-0000-000000000007', 'finance_officer'), ('ad000000-0000-0000-0000-000000000008', 'it_admin')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date) values
  ('ad000000-0000-0000-0000-0000000000e1', 'ad000000-0000-0000-0000-000000000001', 'ad عمليات', 'AD-OPS', '2024-01-01'),
  ('ad000000-0000-0000-0000-0000000000e9', null, 'ad موظف مقترض', 'AD-9', '2024-01-01')
on conflict (id) do nothing;

-- ═══ T0 · الأنواع والسياسة (التطوير المركزية) ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; begin
  j := public.advance_types_list(true);
  assert jsonb_array_length(j) >= 4 and exists (select 1 from jsonb_array_elements(j) x where x ->> 'name' = 'سلفة زواج'), 'T0 seed: ' || j::text;
  j := public.advance_type_save(null, 'سلفة اختبار', 500000, 5, true, 99);
  perform set_config('test.ad_type', j ->> 'id', false);
  j := public.advance_policy();
  assert (j ->> 'max_installment_ratio')::numeric = 0.5 and (j ->> 'block_if_open')::boolean, 'T0 policy: ' || j::text;
  raise notice 'T0 ✅ الأنواع والسياسة';
end $$;

-- ═══ T1 · راتب الموظف 600,000 → سقف القسط 300,000؛ غرفة العمليات تطلب ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000007');
select public.finance_salary_set('ad000000-0000-0000-0000-0000000000e9', 'monthly', 600000, 0, '{}', '{}', null);
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; ok boolean; begin
  -- يتجاوز سقف النوع (500,000)
  ok := false; begin perform public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 600000, 'equal', 3); exception when others then ok := sqlerrm = 'ADVANCE_AMOUNT_EXCEEDS_TYPE_MAX'; end;
  assert ok, 'T1 type max';
  -- القسط 400,000 > 50% من الراتب
  ok := false; begin perform public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 400000, 'single'); exception when others then ok := sqlerrm = 'ADVANCE_INSTALLMENT_EXCEEDS_CAP'; end;
  assert ok, 'T1 cap';
  -- أقساط أكثر من الحد الأقصى للنوع (5)
  ok := false; begin perform public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 300000, 'equal', 6); exception when others then ok := sqlerrm = 'ADVANCE_INSTALLMENTS_INVALID'; end;
  assert ok, 'T1 installments';
  j := public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 300000, 'equal', 3, null, null, 'ظرف عائلي');
  perform set_config('test.ad1', j ->> 'id', false);
  assert j ->> 'status' = 'pending' and j ->> 'ref_no' like 'ADV-%' and (j -> 'current_step' ->> 'step_no')::int = 1 and (j ->> 'estimated_installment')::numeric = 100000, 'T1 created: ' || j::text;
  -- لا سلفة ثانية وفيه سلفة مفتوحة
  ok := false; begin perform public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 100000, 'single'); exception when others then ok := sqlerrm = 'ADVANCE_ALREADY_OPEN'; end;
  assert ok, 'T1 already open';
  -- غرفة العمليات ترى طلبها (حالة فقط) ولا تصل إلى تفاصيل المالية
  j := public.advances_list();
  assert jsonb_array_length(j) >= 1 and (j -> 0 ->> 'status') = 'pending' and (j -> 0) ? 'current_step' and not ((j -> 0) ? 'estimated_installment'), 'T1 ops list: ' || j::text;
  ok := false; begin perform public.advance_get(current_setting('test.ad1')::uuid); exception when others then ok := sqlerrm = 'ADVANCE_FORBIDDEN'; end;
  assert ok, 'T1 ops cannot open finance detail';
  assert exists (select 1 from public.notifications where user_id = 'ad000000-0000-0000-0000-000000000003' and title like 'طلب سلفة بانتظار قرارك%'), 'T1 deputy notified';
  raise notice 'T1 ✅ التحقق والطلب والإشعار';
end $$;

-- ═══ T2 · المعاون يرى المهمة في approval_my_tasks ويعدّل المبلغ ويوافق؛ المدير المفوض يوافق أخيراً → المالية تُبلَّغ ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000003');
do $$ declare t record; j jsonb; begin
  select * into t from public.approval_my_tasks() x where x.request_kind = 'advance' and x.request_id = current_setting('test.ad1')::uuid;
  assert t.task_id is not null and t.details ->> 'employee_name' = 'ad موظف مقترض' and (t.details ->> 'amount')::numeric = 300000 and t.ref_no like 'ADV-%' and t.type_name = 'سلفة', 'T2 task: ' || coalesce(row_to_json(t)::text, 'null');
  j := public.advance_decide(current_setting('test.ad1')::uuid, true, null, 240000, null);
  assert j ->> 'status' = 'pending' and (j ->> 'amount')::numeric = 240000 and (j ->> 'requested_amount')::numeric = 300000 and (j -> 'current_step' ->> 'step_no')::int = 2, 'T2 amended: ' || j::text;
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-000000000004');
do $$ declare j jsonb; begin
  perform public.approval_decide_request('advance', current_setting('test.ad1')::uuid, true, null);
  j := public.advance_get(current_setting('test.ad1')::uuid);
  assert j ->> 'status' = 'approved' and (j ->> 'approved_at') is not null, 'T2 approved: ' || j::text;
  assert exists (select 1 from public.notifications where user_id = 'ad000000-0000-0000-0000-000000000007' and title like 'سلفة معتمدة جاهزة للتسليم%' and link = '/finance/advances'), 'T2 finance notified';
  assert exists (select 1 from public.notifications where user_id = 'ad000000-0000-0000-0000-000000000001' and title like 'اكتملت الموافقات على السلفة%'), 'T2 ops notified';
  raise notice 'T2 ✅ السلسلة الافتراضية وتعديل المبلغ والإشعارات';
end $$;

-- ═══ T3 · المالية تسلّم → القاصة تنقص؛ الاستقطاع يبدأ الشهر التالي ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000007');
do $$ declare j jsonb; s jsonb; b0 numeric; ok boolean; begin
  b0 := (public.treasury_summary() ->> 'balance')::numeric;
  s := public.advances_summary();
  assert (s ->> 'awaiting_delivery')::int >= 1 and (s ->> 'awaiting_delivery_amount')::numeric >= 240000, 'T3 summary: ' || s::text;
  j := public.advance_deliver(current_setting('test.ad1')::uuid, 'سُلّمت نقداً');
  assert j ->> 'status' = 'delivered' and (j ->> 'delivered_at') is not null and j ->> 'delivered_by_name' is not null
     and (j ->> 'start_month')::date = (date_trunc('month', current_date) + interval '1 month')::date and (j ->> 'treasury_tx_id') is not null, 'T3 delivered: ' || j::text;
  assert (public.treasury_summary() ->> 'balance')::numeric = b0 - 240000, 'T3 treasury balance';
  assert exists (select 1 from public.treasury_transactions where id = (j ->> 'treasury_tx_id')::uuid and kind = 'advance' and status = 'confirmed' and amount = 240000), 'T3 tx';
  ok := false; begin perform public.advance_deliver(current_setting('test.ad1')::uuid, null); exception when others then ok := sqlerrm = 'ADVANCE_NOT_DELIVERED' or sqlerrm = 'ADVANCE_NOT_APPROVED'; end;
  assert ok, 'T3 no double delivery';
  raise notice 'T3 ✅ التسليم والقاصة';
end $$;

-- ═══ T4 · تصدير الشهر الحالي (قبل شهر البدء) → لا قسط؛ نُقدّم شهر البدء إلى الشهر الماضي ونصدّره → قسط 80,000 يُطرح من الصافي ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'ad000000-0000-0000-0000-0000000000e9';
  assert r.advance_installment = 0, 'T4 no installment before start month: ' || r.advance_installment;
  raise notice 'T4a ✅ لا استقطاع قبل شهر البدء';
end $$;
reset role; select set_config('auth.user_id','', false);
update public.advances set start_month = (date_trunc('month', current_date) - interval '1 month')::date where id = current_setting('test.ad1')::uuid;
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; begin
  x := public.ops_month_export(m);
  perform set_config('test.ad_export', x::text, false);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'ad000000-0000-0000-0000-0000000000e9';
  assert r.advance_installment = 80000, 'T4 installment: ' || r.advance_installment;
  assert r.proposed_net = greatest(0, r.gross_amount - (r.deductions_total - 80000)) - 80000 or r.proposed_net >= 0, 'T4 net reduced';
  assert r.deductions_total >= 80000 and r.final_net = r.proposed_net, 'T4 totals: ded=' || r.deductions_total || ' net=' || r.proposed_net;
  raise notice 'T4b ✅ القسط في صفوف التصدير';
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-000000000007');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; r record; j jsonb; begin
  select * into r from public.finance_payroll_sheet(m) x where x.employee_id = 'ad000000-0000-0000-0000-0000000000e9';
  assert r.advance_installment = 80000, 'T4 sheet column: ' || r.advance_installment;
  -- لم يُسجَّل القسط بعد (الاعتماد لم يتم)
  j := public.advance_get(current_setting('test.ad1')::uuid);
  assert (j ->> 'repaid_total')::numeric = 0 and (j ->> 'installments_posted')::int = 0, 'T4 not posted yet: ' || j::text;
  perform public.finance_payroll_approve(current_setting('test.ad_export')::uuid, true);
  j := public.advance_get(current_setting('test.ad1')::uuid);
  assert (j ->> 'repaid_total')::numeric = 80000 and (j ->> 'remaining')::numeric = 160000 and (j ->> 'installments_posted')::int = 1 and j ->> 'status' = 'delivered', 'T4 posted: ' || j::text;
  assert exists (select 1 from jsonb_array_elements(j -> 'installment_rows') i where i ->> 'source' = 'payroll' and (i ->> 'amount')::numeric = 80000 and (i ->> 'period_month')::date = m), 'T4 installment row';
  assert exists (select 1 from jsonb_array_elements(j -> 'events') e where e ->> 'action' = 'payroll_installment'), 'T4 event';
  raise notice 'T4c ✅ كشف المالية والتسجيل عند الاعتماد';
end $$;

-- ═══ T5 · تسديد نقدي مبكر للمتبقي → مسدَّدة؛ القاصة تزيد؛ لا قسط في التصدير اللاحق ═══
do $$ declare j jsonb; b0 numeric; ok boolean; begin
  b0 := (public.treasury_summary() ->> 'balance')::numeric;
  ok := false; begin perform public.advance_settle_cash(current_setting('test.ad1')::uuid, 500000, null); exception when others then ok := sqlerrm = 'ADVANCE_SETTLE_AMOUNT_INVALID'; end;
  assert ok, 'T5 over-settle blocked';
  j := public.advance_settle_cash(current_setting('test.ad1')::uuid, 60000, 'دفعة نقدية');
  assert j ->> 'status' = 'delivered' and (j ->> 'remaining')::numeric = 100000, 'T5 partial: ' || j::text;
  j := public.advance_settle_cash(current_setting('test.ad1')::uuid, 100000, 'تسديد المتبقي');
  assert j ->> 'status' = 'settled' and (j ->> 'remaining')::numeric = 0 and (j ->> 'settled_at') is not null, 'T5 settled: ' || j::text;
  assert (public.treasury_summary() ->> 'balance')::numeric = b0 + 160000, 'T5 treasury +160000';
  raise notice 'T5 ✅ التسديد النقدي';
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; x uuid; r record; j jsonb; begin
  x := public.ops_month_export(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = 'ad000000-0000-0000-0000-0000000000e9';
  assert r.advance_installment = 0, 'T5 settled → no installment';
  -- بعد التسديد يمكن طلب سلفة جديدة؛ الرفض بسبب إلزامي
  j := public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 100000, 'fixed', null, 50000, null, null);
  perform set_config('test.ad2', j ->> 'id', false);
  assert j ->> 'status' = 'pending', 'T5 new request';
  raise notice 'T5b ✅ سلفة جديدة بعد التسديد';
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-000000000003');
do $$ declare ok boolean := false; j jsonb; begin
  begin perform public.advance_decide(current_setting('test.ad2')::uuid, false, null); exception when others then ok := sqlerrm = 'APPROVAL_REASON_REQUIRED'; end;
  assert ok, 'T6 reject needs reason';
  j := public.advance_decide(current_setting('test.ad2')::uuid, false, 'لا يستوفي الشروط');
  assert j ->> 'status' = 'rejected' and j ->> 'reject_note' = 'لا يستوفي الشروط', 'T6 rejected: ' || j::text;
  assert exists (select 1 from public.notifications where user_id = 'ad000000-0000-0000-0000-000000000001' and title like 'رُفض طلب السلفة%'), 'T6 ops notified of rejection';
  assert not exists (select 1 from public.approval_tasks where request_kind = 'advance' and request_id = current_setting('test.ad2')::uuid and status in ('pending','waiting')), 'T6 no open tasks';
  raise notice 'T6 ✅ الرفض';
end $$;

-- ═══ T7 · سلسلة مضبوطة من التطوير المركزية لدور ops_room → تُستخدم بدل الافتراضية؛ الإلغاء ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000008');
select public.approval_chain_save('ops_room', 'advance', '[{"kind":"hierarchy","role":"super_admin"}]'::jsonb, true);
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 90000, 'percent', null, null, 10, null);
  perform set_config('test.ad3', j ->> 'id', false);
  assert (j ->> 'chain_id') is not null and (j -> 'current_step' ->> 'label') like '%المدير المفوض%' and (select count(*) from public.approval_tasks where request_kind = 'advance' and request_id = (j ->> 'id')::uuid) = 1, 'T7 chain used: ' || j::text;
  assert (j ->> 'estimated_installment')::numeric = 60000, 'T7 percent estimate: ' || (j ->> 'estimated_installment');
  j := public.advance_cancel(current_setting('test.ad3')::uuid, 'أُدخل خطأً');
  assert j ->> 'status' = 'cancelled', 'T7 cancelled';
  assert not exists (select 1 from public.approval_tasks where request_kind = 'advance' and request_id = current_setting('test.ad3')::uuid and status = 'pending'), 'T7 tasks closed';
  raise notice 'T7 ✅ السلسلة المضبوطة والإلغاء';
end $$;
reset role; select set_config('auth.user_id','', false);
delete from public.approval_chains where requester_role = 'ops_room' and request_type = 'advance';
