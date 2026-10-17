-- 00239: غرفة العمليات تقدّم طلب إجازة نيابةً عن أي موظف في الملاك (حتى بلا حساب/بصمة)؛
-- الطلب يمرّ بسلسلة الموافقات الاعتيادية (المدير المباشر)، يحمل وسم «قُدِّم عبر غرفة العمليات»، ويُعلَم الموظف. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-000000000001', 'ol-ops@t.iq'), ('a9000000-0000-0000-0000-000000000002', 'ol-mgr@t.iq'),
  ('a9000000-0000-0000-0000-000000000003', 'ol-emp@t.iq'), ('a9000000-0000-0000-0000-000000000004', 'ol-fin@t.iq'),
  ('a9000000-0000-0000-0000-000000000005', 'ol-hr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('a9000000-0000-0000-0000-000000000001', 'ops_room'), ('a9000000-0000-0000-0000-000000000002', 'department_manager'),
  ('a9000000-0000-0000-0000-000000000003', 'employee'), ('a9000000-0000-0000-0000-000000000004', 'finance_officer'),
  ('a9000000-0000-0000-0000-000000000005', 'hr_officer') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('b9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000002', 'OL-MGR', 'مدير الاختبار', '2024-01-01', 'OLM'),
  ('b9000000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-000000000003', 'OL-EMP', 'موظف بحساب', '2024-01-01', 'OLE'),
  ('b9000000-0000-0000-0000-000000000006', null, 'OL-NOACC', 'موظف بلا حساب ولا بصمة', '2024-01-01', null),
  ('b9000000-0000-0000-0000-000000000007', null, 'OL-ORPHAN', 'موظف بلا مدير', '2024-01-01', null)
on conflict (employee_number) do nothing;
update public.employees set manager_id = 'b9000000-0000-0000-0000-000000000002' where id in ('b9000000-0000-0000-0000-000000000003', 'b9000000-0000-0000-0000-000000000006');

-- ① بحث الموظفين: غرفة العمليات ترى كل الملاك؛ المالية لا
select auth.set_test_user('a9000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.ops_leave_employee_lookup('OL-');
  assert jsonb_array_length(j) = 4, 'lookup all staff: ' || j::text;
  assert exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'OL-NOACC' and not (x ->> 'has_account')::boolean and not (x ->> 'has_biometric')::boolean and x ->> 'manager_name' = 'مدير الاختبار'), 'lookup flags';
  perform auth.set_test_user('a9000000-0000-0000-0000-000000000004');
  assert jsonb_array_length(public.ops_leave_employee_lookup('OL-')) = 0, 'finance sees nothing';
  raise notice 'OL1 ✅ البحث';
end $$;

-- ② الطلب نيابةً عن موظف بحساب: يمرّ للمدير المباشر، يحمل الوسم، ويُعلَم الموظف
select auth.set_test_user('a9000000-0000-0000-0000-000000000001');
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 7; r record; begin
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request('b9000000-0000-0000-0000-000000000003', t, d, d + 1);
  select * into r from public.hr_leaves where id = lid;
  assert r.status = 'pending' and r.requested_via = 'ops_room' and r.requested_by = 'a9000000-0000-0000-0000-000000000001' and r.manager_id = 'b9000000-0000-0000-0000-000000000002', 'row: ' || row_to_json(r)::text;
  assert exists (select 1 from public.notifications n where n.user_id = 'a9000000-0000-0000-0000-000000000002' and n.body like '%قُدِّم عبر غرفة العمليات%'), 'manager notified with via tag';
  assert exists (select 1 from public.notifications n where n.user_id = 'a9000000-0000-0000-0000-000000000003' and n.title like 'قُدِّم طلب%من غرفة العمليات'), 'employee notified';
  perform set_config('test.ol_lid', lid::text, false);
  -- القائمة تُظهر الجهة واسم المُقدِّم، وغرفة العمليات تستطيع إلغاء ما قدّمته وهو معلّق
  select * into r from public.hr_leaves_list('all') x where x.id = lid;
  assert r.requested_via = 'ops_room' and r.requester_name is not null and r.can_cancel and not r.can_decide, 'list row: ' || row_to_json(r)::text;
  -- غرفة العمليات لا تبتّ
  begin perform public.hr_leave_decide(lid, true, null); raise exception 'should fail';
  exception when others then if sqlerrm = 'should fail' then raise; end if; end;
  raise notice 'OL2 ✅ الطلب نيابةً عن موظف بحساب';
end $$;

-- ③ المدير المباشر يعتمد كالمعتاد
select auth.set_test_user('a9000000-0000-0000-0000-000000000002');
do $$ declare r record; begin
  perform public.hr_leave_decide(current_setting('test.ol_lid')::uuid, true, null);
  select * into r from public.hr_leaves where id = current_setting('test.ol_lid')::uuid;
  assert r.status = 'approved', 'approved by manager: ' || r.status;
  raise notice 'OL3 ✅ الاعتماد من السلسلة الاعتيادية';
end $$;

-- ④ موظف بلا حساب ولا بصمة: غرفة العمليات تستطيع؛ بلا مدير ولا سلسلة ⇒ HR_NO_MANAGER؛ الملخص
select auth.set_test_user('a9000000-0000-0000-0000-000000000001');
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 10; j jsonb; begin
  select id into t from public.hr_leave_types where code = 'unpaid';
  lid := public.hr_leave_request('b9000000-0000-0000-0000-000000000006', t, d, d);
  assert (select requested_via from public.hr_leaves where id = lid) = 'ops_room', 'no-account employee request';
  begin perform public.hr_leave_request('b9000000-0000-0000-0000-000000000007', t, d, d); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_NO_MANAGER', 'orphan: ' || sqlerrm; end;
  j := public.ops_leaves_summary();
  assert (j ->> 'via_ops_pending')::int >= 1 and (j ->> 'via_ops_month')::int >= 2, 'summary: ' || j::text;
  -- إلغاء ما قدّمته وهو معلّق
  perform public.hr_leave_cancel(lid, 'خطأ في الإدخال');
  assert (select status from public.hr_leaves where id = lid) = 'cancelled', 'cancelled by requester';
  raise notice 'OL4 ✅ بلا حساب/بصمة · بلا مدير · الملخص · الإلغاء';
end $$;

-- ⑤ الموظف العادي لا يصل لدوال غرفة العمليات، والطلب الذاتي يُوسم self
select auth.set_test_user('a9000000-0000-0000-0000-000000000003');
do $$ declare t uuid; lid uuid; d date := app.hr_local_date(now()) + 20; begin
  begin perform public.ops_leaves_summary(); raise exception 'should fail';
  exception when others then assert sqlerrm = 'OPS_ROOM_FORBIDDEN', 'summary forbidden: ' || sqlerrm; end;
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request('b9000000-0000-0000-0000-000000000003', t, d, d);
  assert (select requested_via from public.hr_leaves where id = lid) = 'self', 'self via';
  raise notice 'OL5 ✅ العزل';
end $$;
