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
select 'test ok' as result;
