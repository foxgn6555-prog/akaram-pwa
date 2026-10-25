-- اختبار 00223: بوابة الصيانة — الموظفون/الطلبات/الإجراءات بنطاق قسم الصيانة فقط
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('ec230000-0000-0000-0000-000000000001', 'mn1@t.iq'), ('ec230000-0000-0000-0000-000000000002', 'mn2@t.iq'), ('ec230000-0000-0000-0000-000000000003', 'mnemp@t.iq'), ('ec230000-0000-0000-0000-000000000004', 'mnout@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ec230000-0000-0000-0000-000000000001', 'maintenance'), ('ec230000-0000-0000-0000-000000000002', 'maintenance'),
  ('ec230000-0000-0000-0000-000000000003', 'employee'), ('ec230000-0000-0000-0000-000000000004', 'employee')
on conflict do nothing;
insert into auth.users (id, email) values ('ec230000-0000-0000-0000-000000000048', 'ec230000-ceo@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('ec230000-0000-0000-0000-000000000048', 'super_admin') on conflict do nothing;   -- 00348: الخطوة الافتراضية لطلب التعيين
insert into public.departments (id, name, code) values ('dc230000-0000-0000-0000-0000000000a1', 'الصيانة', 'MNT'), ('dc230000-0000-0000-0000-0000000000b1', 'قسم بعيد', 'FAR') on conflict do nothing;
insert into public.departments (id, name, code, parent_id) values ('dc230000-0000-0000-0000-0000000000a2', 'ورشة الصيانة', 'MNTW', 'dc230000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin) values
  ('fc230000-0000-0000-0000-000000000001', 'ec230000-0000-0000-0000-000000000001', 'M-OFF', 'مسؤول الصيانة', '2024-01-01', 'dc230000-0000-0000-0000-0000000000a1', 'M1'),
  ('fc230000-0000-0000-0000-000000000003', 'ec230000-0000-0000-0000-000000000003', 'M-EMP', 'فني الورشة', '2024-01-01', 'dc230000-0000-0000-0000-0000000000a2', 'M3'),
  ('fc230000-0000-0000-0000-000000000004', 'ec230000-0000-0000-0000-000000000004', 'M-OUT', 'موظف خارج الصيانة', '2024-01-01', 'dc230000-0000-0000-0000-0000000000b1', 'M4')
on conflict (employee_number) do nothing;

-- ① حساب صيانة بلا سجل موظف ⇒ MAINTENANCE_NO_DEPARTMENT
select auth.set_test_user('ec230000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.garage_employees(null, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'MAINTENANCE_NO_DEPARTMENT', 'no dept: ' || sqlerrm; end;
end $$;

-- ② الصيانة: قسمها وفروعه فقط، بلا حقول حساسة
select auth.set_test_user('ec230000-0000-0000-0000-000000000001');
do $$ declare j jsonb; r jsonb; begin
  j := public.garage_employees(null, current_date);
  assert (j ->> 'scoped')::boolean and j ->> 'department' = 'الصيانة', 'scoped: ' || j::text;
  assert (j -> 'summary' ->> 'total')::int = 2, 'two in scope: ' || (j -> 'summary')::text;
  assert exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'M-EMP' and x ->> 'department' = 'ورشة الصيانة'), 'sub-dept included';
  assert not exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'M-OUT'), 'outsider excluded';
  r := (select x from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'M-EMP');
  assert not (r ? 'biometric_pin') and not (r ? 'salary') and not (r ? 'base_salary') and not (r ? 'national_id_number'), 'no sensitive: ' || r::text;
  assert jsonb_array_length(public.garage_employees('M-EMP', null) -> 'rows') = 1, 'search';
end $$;

-- ③ الموظف العادي ممنوع
select auth.set_test_user('ec230000-0000-0000-0000-000000000003');
do $$ begin
  begin perform public.garage_employees(null, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_FORBIDDEN', 'forbidden: ' || sqlerrm; end;
end $$;

-- ④ (00223) الطلبات: الصيانة تُدخل إجازة نيابةً عن موظف قسمها، تراها في النطاق، تلغيها؛ لا تستطيع لموظف خارج قسمها
update public.employees set manager_id = 'fc230000-0000-0000-0000-000000000001' where id = 'fc230000-0000-0000-0000-000000000003';
select auth.set_test_user('ec230000-0000-0000-0000-000000000001');
do $$ declare t uuid; lid uuid; j jsonb; begin
  select id into t from public.hr_leave_types where code = 'unpaid';
  lid := public.hr_leave_request('fc230000-0000-0000-0000-000000000003', t, current_date + 3, current_date + 4, null, null, 'طلب من الصيانة');
  assert exists (select 1 from public.hr_leaves_list('garage') x where x.id = lid and x.employee_number = 'M-EMP' and x.can_cancel), 'maintenance scope sees it with can_cancel';
  assert not exists (select 1 from public.hr_leaves_list('garage') x where x.employee_number = 'M-OUT'), 'maintenance scope excludes outsiders';
  assert (public.hr_leave_balance('fc230000-0000-0000-0000-000000000003') ? 'remaining'), 'maintenance reads balance of its employee';
  j := public.garage_leaves_summary();
  assert (j ->> 'pending')::int >= 1 and (j ->> 'scoped')::boolean, 'summary: ' || j::text;
  begin perform public.hr_leave_request('fc230000-0000-0000-0000-000000000004', t, current_date + 3, current_date + 3, null, null, 'خارج القسم'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'outsider: ' || sqlerrm; end;
  begin perform public.hr_leave_balance('fc230000-0000-0000-0000-000000000004'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HR_FORBIDDEN', 'outsider balance: ' || sqlerrm; end;
  perform public.hr_leave_cancel(lid, 'أُدخل بالخطأ');
  assert (select status from public.hr_leaves where id = lid) = 'cancelled', 'maintenance cancels own pending request';
end $$;
-- ⑤ حساب صيانة بلا قسم ⇒ النطاق يرفع MAINTENANCE_NO_DEPARTMENT في الطلبات أيضاً
select auth.set_test_user('ec230000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.garage_leaves_summary(); raise exception 'should fail';
  exception when others then assert sqlerrm = 'MAINTENANCE_NO_DEPARTMENT', 'summary no dept: ' || sqlerrm; end;
end $$;

-- ⑥ (00223) الإجراءات: الصيانة تطلب إنهاء خدمة موظف قسمها فقط (عبر الموافقات)، وتُعيّن ببيانات أساسية داخل هيكل قسمها (M-xxxx)
insert into auth.users (id, email) values ('ec230000-0000-0000-0000-000000000009', 'mnhr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('ec230000-0000-0000-0000-000000000009', 'hr_officer') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('dc230000-0000-0000-0000-0000000000a3', 'فني صيانة', 'MNTJ', 'dc230000-0000-0000-0000-0000000000a2', true) on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('dc230000-0000-0000-0000-0000000000b2', 'كاتب', 'FARJ', 'dc230000-0000-0000-0000-0000000000b1', true) on conflict do nothing;
select auth.set_test_user('ec230000-0000-0000-0000-000000000001');
do $$ declare names text[]; rid uuid; o jsonb; h jsonb; begin
  assert app.procedure_role() = 'maintenance', 'role: ' || coalesce(app.procedure_role(), 'null');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  assert names = array['فني الورشة'], 'maintenance targets (own dept, not self, no outsiders): ' || coalesce(names::text, 'null');
  begin perform public.termination_request_create('employee', 'fc230000-0000-0000-0000-000000000004', 'dismissal', current_date + 7, 'سبب كافٍ هنا'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'PROCEDURE_TARGET_FORBIDDEN', 'outsider termination: ' || sqlerrm; end;
  rid := public.termination_request_create('employee', 'fc230000-0000-0000-0000-000000000003', 'resignation', current_date + 7, 'استقالة بطلب الموظف');
  assert (select status from public.termination_requests where id = rid) = 'pending' and (select requester_role from public.termination_requests where id = rid) = 'maintenance', 'pending via approvals';
  assert (select employment_status from public.employees where id = 'fc230000-0000-0000-0000-000000000003') <> 'terminated', 'not executed before approval';
  assert app.procedures_link_for('ec230000-0000-0000-0000-000000000001') = '/maintenance/procedures', 'link';
  perform public.termination_request_cancel(rid);
  o := public.garage_hire_options();
  assert not (o ? 'next_employee_number'), 'no number suggestion (00348)';
  assert exists (select 1 from jsonb_array_elements(o -> 'job_titles') t where t ->> 'name' = 'فني صيانة'), 'in-scope title: ' || o::text;
  assert not exists (select 1 from jsonb_array_elements(o -> 'job_titles') t where t ->> 'name' = 'كاتب'), 'out-of-scope title hidden';
  -- 00348: لا تعيين مباشراً — طلب تعيين عبر الموافقات (التفاصيل في hire-requests-test.sql)
  begin perform public.garage_employee_hire(jsonb_build_object('full_name', 'فني جديد', 'employee_number', 'M-0901', 'job_title_id', 'dc230000-0000-0000-0000-0000000000a3')); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HIRE_DIRECT_DISABLED', 'direct hire disabled: ' || sqlerrm; end;
  begin perform public.hire_request_create(jsonb_build_object('full_name', 'فني جديد', 'job_title_id', 'dc230000-0000-0000-0000-0000000000a3', 'base_salary', 1)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_SENSITIVE_FIELD_FORBIDDEN', 'sensitive: ' || sqlerrm; end;
  begin perform public.hire_request_create(jsonb_build_object('full_name', 'فني جديد', 'job_title_id', 'dc230000-0000-0000-0000-0000000000b2')); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_JOB_TITLE_OUT_OF_SCOPE', 'title scope: ' || sqlerrm; end;
  begin perform public.hire_request_create(jsonb_build_object('full_name', 'فني جديد', 'employee_number', 'M-0901', 'job_title_id', 'dc230000-0000-0000-0000-0000000000a3')); raise exception 'should fail';
  exception when others then assert sqlerrm = 'HIRE_NUMBER_NOT_ALLOWED', 'number not allowed: ' || sqlerrm; end;
  h := public.hire_request_create(jsonb_build_object('full_name', 'فني جديد', 'job_title_id', 'dc230000-0000-0000-0000-0000000000a3'));
  assert h ->> 'status' = 'pending' and h ->> 'job_title' = 'فني صيانة', 'requested: ' || h::text;
  assert not exists (select 1 from public.employees where full_name = 'فني جديد'), 'no employee from a request';
  assert (public.garage_employees('M-0901', null) -> 'summary' ->> 'total')::int = 0, 'not in employees yet';
end $$;


-- ⑦ (00348) الموارد البشرية ترى طلب التعيين المعلّق (لإكماله لاحقاً) ولا موظف بعد
select auth.set_test_user('ec230000-0000-0000-0000-000000000009');
do $$ begin
  assert exists (select 1 from public.hire_requests where full_name = 'فني جديد' and source = 'maintenance' and status = 'pending'), 'hr sees hire request';
  assert not exists (select 1 from public.employees where employee_number = 'M-0901'), 'no employee before hr completion';
end $$;
select 'test ok' as result;
