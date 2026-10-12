-- اختبار 00210: وحدة الكشوفات لمسؤول القاطع — موظفوه فقط (مسؤولو أقسام/متعهدو قواطعه + من مديرهم المباشر هو)، لا آليات، لا خارج النطاق. بادئة eb.
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('eb000000-0000-0000-0000-000000000001', 'it-d@t.iq'), ('eb000000-0000-0000-0000-000000000003', 'dm4-d@t.iq'), ('eb000000-0000-0000-0000-000000000004', 'sm-d@t.iq'),
  ('eb000000-0000-0000-0000-000000000006', 'dm7-d@t.iq'), ('eb000000-0000-0000-0000-000000000008', 'dep-d@t.iq'), ('eb000000-0000-0000-0000-00000000000b', 'sm2-d@t.iq'),
  ('eb000000-0000-0000-0000-00000000000c', 'sa-d@t.iq'), ('eb000000-0000-0000-0000-00000000000d', 'sub-d@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('eb000000-0000-0000-0000-000000000001', 'it_admin'), ('eb000000-0000-0000-0000-000000000003', 'department_manager'), ('eb000000-0000-0000-0000-000000000004', 'admin_ops'),
  ('eb000000-0000-0000-0000-000000000006', 'department_manager'), ('eb000000-0000-0000-0000-000000000008', 'deputy_director'), ('eb000000-0000-0000-0000-00000000000b', 'admin_ops'),
  ('eb000000-0000-0000-0000-00000000000c', 'super_admin'), ('eb000000-0000-0000-0000-00000000000d', 'employee')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('eb000000-0000-0000-0000-000000000003', 'morning', '{4}'), ('eb000000-0000-0000-0000-000000000006', 'evening', '{7}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('eb000000-0000-0000-0000-0000000000e3', 'eb000000-0000-0000-0000-000000000003', 'DS-M4', 'مسؤول قسم 4', '2024-01-01', '0771', 'd3'),
  ('eb000000-0000-0000-0000-0000000000e6', 'eb000000-0000-0000-0000-000000000006', 'DS-M7', 'مسؤول قسم 7', '2024-01-01', '0772', 'd6'),
  ('eb000000-0000-0000-0000-0000000000e4', 'eb000000-0000-0000-0000-000000000004', 'DS-SM', 'مسؤول قاطع الكرادة', '2024-01-01', '0774', 'd4'),
  ('eb000000-0000-0000-0000-0000000000ed', 'eb000000-0000-0000-0000-00000000000d', 'DS-SUB', 'موظف تابع للمسؤول', '2024-01-01', '0779', 'dd')
on conflict (employee_number) do nothing;
update public.employees set manager_id = 'eb000000-0000-0000-0000-0000000000e4' where id = 'eb000000-0000-0000-0000-0000000000ed';

-- ① مسؤول قاطع بلا قواطع ⇒ خطأ واضح
select auth.set_test_user('eb000000-0000-0000-0000-00000000000b');
do $$ begin
  begin perform public.disclosures_list('active'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'SECTOR_MANAGER_NOT_ASSIGNED', 'not assigned: ' || sqlerrm; end;
  raise notice 'S1 ✅ مسؤول قاطع بلا قواطع ⇒ SECTOR_MANAGER_NOT_ASSIGNED';
end $$;

-- ② التهيئة من التطوير المركزية
select auth.set_test_user('eb000000-0000-0000-0000-000000000001');
select public.sector_manager_profile_save('eb000000-0000-0000-0000-000000000004', '{karrada}');

-- ③ مسؤول قاطع الكرادة: موظفوه فقط؛ لا آليات؛ لا خارج النطاق؛ الرفع يذهب للموافقات
select auth.set_test_user('eb000000-0000-0000-0000-000000000004');
do $$ declare j jsonb; d jsonb; begin
  j := public.disclosure_employee_lookup(null, 50);
  assert exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'DS-M4'), 'dept manager of karrada in lookup: ' || j::text;
  assert exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'DS-SUB'), 'direct report in lookup: ' || j::text;
  assert not exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'DS-M7'), 'zaafaraniya manager hidden';
  assert not exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'DS-SM'), 'self hidden';
  begin perform public.disclosure_save(null, jsonb_build_object('target_kind','vehicle','vehicle_id', gen_random_uuid(), 'violation_type','delay','details','تفاصيل كافية هنا','log_date', current_date)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_GARAGE_EMPLOYEE_ONLY', 'vehicle blocked: ' || sqlerrm; end;
  begin perform public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','eb000000-0000-0000-0000-0000000000e6','violation_type','delay','details','تفاصيل كافية هنا','log_date', current_date)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_OUT_OF_SCOPE', 'outsider blocked: ' || sqlerrm; end;
  d := public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','eb000000-0000-0000-0000-0000000000e3','violation_type','delay','details','تأخر عن الدوام الصباحي','log_date', current_date));
  assert d ->> 'status' = 'draft' and d ->> 'employee_number' = 'DS-M4', 'saved: ' || d::text;
  assert jsonb_array_length(public.disclosures_list('active')) = 1, 'sees own draft';
  assert (public.disclosure_stats(current_date) ->> 'total')::int = 1, 'stats scoped';
  d := public.disclosure_submit((d ->> 'id')::uuid);
  assert d ->> 'status' = 'pending', 'submitted: ' || (d ->> 'status');
  assert app.disclosure_link_for('eb000000-0000-0000-0000-000000000004', 'inbox') = '/admin-ops/disclosures?tab=inbox', 'link';
  raise notice 'S2 ✅ مسؤول القاطع: موظفوه فقط، لا آليات، الرفع للموافقات';
end $$;

-- ④ المعاون يرى الكشف في صندوقه؛ غرفة الكشوفات على موظف خارج النطاق لا يراها مسؤول القاطع
select auth.set_test_user('eb000000-0000-0000-0000-00000000000c');
do $$ declare d jsonb; begin
  assert exists (select 1 from jsonb_array_elements(public.disclosures_list('pending')) x where x ->> 'employee_number' = 'DS-M4'), 'admin sees sector manager disclosure';
  d := public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','eb000000-0000-0000-0000-0000000000e6','violation_type','delay','details','تفاصيل كافية هنا','log_date', current_date));
  assert d ->> 'status' = 'draft', 'admin draft';
end $$;
select auth.set_test_user('eb000000-0000-0000-0000-000000000004');
do $$ begin
  assert not exists (select 1 from jsonb_array_elements(public.disclosures_list('all')) x where x ->> 'employee_number' = 'DS-M7'), 'sector manager cannot see outsider disclosure';
  set role authenticated;
  assert not exists (select 1 from public.disclosures where employee_number = 'DS-M7'), 'RLS hides outsider disclosure';
  assert exists (select 1 from public.disclosures where employee_number = 'DS-M4'), 'RLS shows own';
  reset role;
  raise notice 'S3 ✅ النطاق مفروض في الدوال وRLS';
end $$;
