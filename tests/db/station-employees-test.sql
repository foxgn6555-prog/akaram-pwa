-- اختبار 00211: موظفو المحطة التحويلية — المحطة ترى قسمها فقط
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('ec010000-0000-0000-0000-000000000001', 'st1@t.iq'), ('ec010000-0000-0000-0000-000000000002', 'st2@t.iq'), ('ec010000-0000-0000-0000-000000000003', 'stemp@t.iq'), ('ec010000-0000-0000-0000-000000000004', 'stout@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ec010000-0000-0000-0000-000000000001', 'transfer_station'), ('ec010000-0000-0000-0000-000000000002', 'transfer_station'),
  ('ec010000-0000-0000-0000-000000000003', 'employee'), ('ec010000-0000-0000-0000-000000000004', 'employee')
on conflict do nothing;
insert into public.departments (id, name, code) values ('dc010000-0000-0000-0000-0000000000a1', 'المحطة التحويلية', 'TS'), ('dc010000-0000-0000-0000-0000000000b1', 'قسم بعيد', 'FAR') on conflict do nothing;
insert into public.departments (id, name, code, parent_id) values ('dc010000-0000-0000-0000-0000000000a2', 'ميزان المحطة', 'TSW', 'dc010000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin) values
  ('fc010000-0000-0000-0000-000000000001', 'ec010000-0000-0000-0000-000000000001', 'S-OFF', 'مسؤول المحطة', '2024-01-01', 'dc010000-0000-0000-0000-0000000000a1', 'S1'),
  ('fc010000-0000-0000-0000-000000000003', 'ec010000-0000-0000-0000-000000000003', 'S-EMP', 'موظف الميزان', '2024-01-01', 'dc010000-0000-0000-0000-0000000000a2', 'S3'),
  ('fc010000-0000-0000-0000-000000000004', 'ec010000-0000-0000-0000-000000000004', 'S-OUT', 'موظف خارج المحطة', '2024-01-01', 'dc010000-0000-0000-0000-0000000000b1', 'S4')
on conflict (employee_number) do nothing;

-- ① حساب محطة بلا سجل موظف ⇒ STATION_NO_DEPARTMENT
select auth.set_test_user('ec010000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.garage_employees(null, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'STATION_NO_DEPARTMENT', 'no dept: ' || sqlerrm; end;
end $$;

-- ② المحطة: قسمها وفروعه فقط، بلا حقول حساسة
select auth.set_test_user('ec010000-0000-0000-0000-000000000001');
do $$ declare j jsonb; r jsonb; begin
  j := public.garage_employees(null, current_date);
  assert (j ->> 'scoped')::boolean and j ->> 'department' = 'المحطة التحويلية', 'scoped: ' || j::text;
  assert (j -> 'summary' ->> 'total')::int = 2, 'two in scope: ' || (j -> 'summary')::text;
  assert exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'S-EMP' and x ->> 'department' = 'ميزان المحطة'), 'sub-dept included';
  assert not exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'S-OUT'), 'outsider excluded';
  r := (select x from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'S-EMP');
  assert not (r ? 'biometric_pin') and not (r ? 'salary') and not (r ? 'base_salary') and not (r ? 'national_id_number'), 'no sensitive: ' || r::text;
  assert jsonb_array_length(public.garage_employees('S-EMP', null) -> 'rows') = 1, 'search';
end $$;

-- ③ الموظف العادي ممنوع
select auth.set_test_user('ec010000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.garage_employees(null, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_FORBIDDEN', 'forbidden: ' || sqlerrm; end;
end $$;

-- ④ (00212) الطلبات: المحطة تُدخل إجازة نيابةً عن موظف قسمها، تراها في النطاق، تلغيها؛ لا تستطيع لموظف خارج قسمها
update public.employees set manager_id = 'fc010000-0000-0000-0000-000000000001' where id = 'fc010000-0000-0000-0000-000000000003';
select auth.set_test_user('ec010000-0000-0000-0000-000000000001');
do $$ declare t uuid; lid uuid; j jsonb; begin
  select id into t from public.hr_leave_types where code = 'unpaid';
  lid := public.hr_leave_request('fc010000-0000-0000-0000-000000000003', t, current_date + 3, current_date + 4, null, null, 'طلب من المحطة');
  assert exists (select 1 from public.hr_leaves_list('garage') x where x.id = lid and x.employee_number = 'S-EMP' and x.can_cancel), 'station scope sees it with can_cancel';
  assert not exists (select 1 from public.hr_leaves_list('garage') x where x.employee_number = 'S-OUT'), 'station scope excludes outsiders';
  assert (public.hr_leave_balance('fc010000-0000-0000-0000-000000000003') ? 'remaining'), 'station reads balance of its employee';
  j := public.garage_leaves_summary();
  assert (j ->> 'pending')::int >= 1 and (j ->> 'scoped')::boolean, 'summary: ' || j::text;
  begin perform public.hr_leave_request('fc010000-0000-0000-0000-000000000004', t, current_date + 3, current_date + 3, null, null, 'خارج القسم'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'outsider: ' || sqlerrm; end;
  begin perform public.hr_leave_balance('fc010000-0000-0000-0000-000000000004'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'outsider balance: ' || sqlerrm; end;
  perform public.hr_leave_cancel(lid, 'أُدخل بالخطأ');
  assert (select status from public.hr_leaves where id = lid) = 'cancelled', 'station cancels own pending request';
end $$;
-- ⑤ حساب محطة بلا قسم ⇒ النطاق يرفع STATION_NO_DEPARTMENT في الطلبات أيضاً
select auth.set_test_user('ec010000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.garage_leaves_summary(); raise exception 'should fail';
  exception when others then assert sqlerrm = 'STATION_NO_DEPARTMENT', 'summary no dept: ' || sqlerrm; end;
end $$;

-- ⑥ (00213) الإجراءات: المحطة تطلب إنهاء خدمة موظف قسمها فقط (عبر الموافقات)، وتُعيّن ببيانات أساسية داخل هيكل قسمها (S-xxxx)
insert into auth.users (id, email) values ('ec010000-0000-0000-0000-000000000009', 'sthr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('ec010000-0000-0000-0000-000000000009', 'hr_officer') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('dc010000-0000-0000-0000-0000000000a3', 'وزّان', 'TSWJ', 'dc010000-0000-0000-0000-0000000000a2', true) on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('dc010000-0000-0000-0000-0000000000b2', 'كاتب', 'FARJ', 'dc010000-0000-0000-0000-0000000000b1', true) on conflict do nothing;
select auth.set_test_user('ec010000-0000-0000-0000-000000000001');
do $$ declare names text[]; rid uuid; o jsonb; h jsonb; begin
  assert app.procedure_role() = 'station', 'role: ' || coalesce(app.procedure_role(), 'null');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  assert names = array['موظف الميزان'], 'station targets (own dept, not self, no outsiders): ' || coalesce(names::text, 'null');
  begin perform public.termination_request_create('employee', 'fc010000-0000-0000-0000-000000000004', 'dismissal', current_date + 7, 'سبب كافٍ هنا'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'PROCEDURE_TARGET_FORBIDDEN', 'outsider termination: ' || sqlerrm; end;
  rid := public.termination_request_create('employee', 'fc010000-0000-0000-0000-000000000003', 'resignation', current_date + 7, 'استقالة بطلب الموظف');
  assert (select status from public.termination_requests where id = rid) = 'pending' and (select requester_role from public.termination_requests where id = rid) = 'station', 'pending via approvals';
  assert (select employment_status from public.employees where id = 'fc010000-0000-0000-0000-000000000003') <> 'terminated', 'not executed before approval';
  assert app.procedures_link_for('ec010000-0000-0000-0000-000000000001') = '/transfer-station/procedures', 'link';
  perform public.termination_request_cancel(rid);
  o := public.garage_hire_options();
  assert o ->> 'next_employee_number' like 'S-%', 'station prefix: ' || (o ->> 'next_employee_number');
  assert exists (select 1 from jsonb_array_elements(o -> 'job_titles') t where t ->> 'name' = 'وزّان'), 'in-scope title: ' || o::text;
  assert not exists (select 1 from jsonb_array_elements(o -> 'job_titles') t where t ->> 'name' = 'كاتب'), 'out-of-scope title hidden';
  begin perform public.garage_employee_hire(jsonb_build_object('full_name', 'موظف جديد', 'employee_number', 'S-0901', 'job_title_id', 'dc010000-0000-0000-0000-0000000000a3', 'base_salary', 1)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_SENSITIVE_FIELD_FORBIDDEN', 'sensitive: ' || sqlerrm; end;
  begin perform public.garage_employee_hire(jsonb_build_object('full_name', 'موظف جديد', 'employee_number', 'S-0901', 'job_title_id', 'dc010000-0000-0000-0000-0000000000b2')); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_JOB_TITLE_OUT_OF_SCOPE', 'title scope: ' || sqlerrm; end;
  h := public.garage_employee_hire(jsonb_build_object('full_name', 'وزّان جديد', 'employee_number', 'S-0901', 'job_title_id', 'dc010000-0000-0000-0000-0000000000a3'));
  assert (select department_id from public.employees where id = (h ->> 'id')::uuid) = 'dc010000-0000-0000-0000-0000000000a2', 'dept derived from title';
  assert (select status from public.employee_salary_profiles where employee_id = (h ->> 'id')::uuid) = 'pending', 'salary pending for finance';
  assert exists (select 1 from public.finance_hr_notices where employee_id = (h ->> 'id')::uuid and kind = 'salary_pending' and payload ->> 'source' = 'station'), 'finance notice (station)';
  assert exists (select 1 from public.notifications where user_id = 'ec010000-0000-0000-0000-000000000009' and title like 'تعيين جديد من المحطة التحويلية%'), 'hr notified';
  assert exists (select 1 from jsonb_array_elements(public.garage_recent_hires()) r where r ->> 'employee_number' = 'S-0901'), 'recent hires';
  assert (public.garage_employees('S-0901', null) -> 'summary' ->> 'total')::int = 1, 'appears in employees';
end $$;
select 'test ok' as result;
