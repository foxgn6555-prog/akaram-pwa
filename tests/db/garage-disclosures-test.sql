-- اختبار 00206: كشوفات الكراج المركزي (نطاق القسم، موظفون فقط) + عقوبة «غرامة مالية»
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('ee010000-0000-0000-0000-000000000001', 'gmd@t.iq'), ('ee010000-0000-0000-0000-000000000002', 'gops@t.iq'),
  ('ee010000-0000-0000-0000-000000000003', 'garage1@t.iq'), ('ee010000-0000-0000-0000-000000000004', 'garage2@t.iq'),
  ('ee010000-0000-0000-0000-000000000005', 'gdrv@t.iq'), ('ee010000-0000-0000-0000-000000000006', 'gother@t.iq'),
  ('ee010000-0000-0000-0000-000000000007', 'gdep@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ee010000-0000-0000-0000-000000000001', 'super_admin'), ('ee010000-0000-0000-0000-000000000002', 'ops_room'),
  ('ee010000-0000-0000-0000-000000000003', 'central_garage_officer'), ('ee010000-0000-0000-0000-000000000004', 'central_garage_officer'),
  ('ee010000-0000-0000-0000-000000000005', 'employee'), ('ee010000-0000-0000-0000-000000000006', 'employee'), ('ee010000-0000-0000-0000-000000000007', 'deputy_director')
on conflict do nothing;
insert into public.departments (id, name, code) values ('dd010000-0000-0000-0000-0000000000a1', 'الكراج المركزي – الكرادة', 'GK'), ('dd010000-0000-0000-0000-0000000000b1', 'قسم آخر', 'OT') on conflict do nothing;
insert into public.departments (id, name, code, parent_id) values ('dd010000-0000-0000-0000-0000000000a2', 'سوّاق الكراج', 'GKD', 'dd010000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin) values
  ('ff010000-0000-0000-0000-000000000003', 'ee010000-0000-0000-0000-000000000003', 'G-OFF', 'مسؤول الكراج', '2024-01-01', 'dd010000-0000-0000-0000-0000000000a1', 'G3'),
  ('ff010000-0000-0000-0000-000000000005', 'ee010000-0000-0000-0000-000000000005', 'G-DRV', 'سائق الكراج', '2024-01-01', 'dd010000-0000-0000-0000-0000000000a2', 'G5'),
  ('ff010000-0000-0000-0000-000000000006', 'ee010000-0000-0000-0000-000000000006', 'G-OTH', 'موظف خارج الكراج', '2024-01-01', 'dd010000-0000-0000-0000-0000000000b1', 'G6')
on conflict (employee_number) do nothing;

-- ① حساب كراج بلا سجل موظف ⇒ خطأ واضح
select auth.set_test_user('ee010000-0000-0000-0000-000000000004');
do $$ begin
  begin perform public.disclosures_list('active'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_NO_DEPARTMENT', 'no dept: ' || sqlerrm; end;
  raise notice 'G1 ✅ كراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT';
end $$;

-- ② الكراج: البحث يعيد موظفي قسمه وفروعه فقط؛ لا كشوفات على آليات؛ لا كشوفات خارج القسم؛ غرامة مالية تلزم مبلغاً
select auth.set_test_user('ee010000-0000-0000-0000-000000000003');
do $$ declare j jsonb; d jsonb; did uuid; begin
  j := public.disclosure_employee_lookup(null, 50);
  assert exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'G-DRV'), 'driver in lookup: ' || j::text;
  assert not exists (select 1 from jsonb_array_elements(j) x where x ->> 'employee_number' = 'G-OTH'), 'outsider hidden: ' || j::text;
  begin perform public.disclosure_save(null, jsonb_build_object('target_kind','vehicle','vehicle_id', gen_random_uuid(), 'violation_type','delay','details','تفاصيل كافية هنا','log_date', current_date)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_GARAGE_EMPLOYEE_ONLY', 'vehicle blocked: ' || sqlerrm; end;
  begin perform public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','ff010000-0000-0000-0000-000000000006','violation_type','delay','details','تفاصيل كافية هنا','log_date', current_date)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_OUT_OF_SCOPE', 'outsider blocked: ' || sqlerrm; end;
  assert (select 'fine' = any(allowed_penalties) from public.disclosure_types where key = 'delay'), 'fine allowed on existing types';
  begin perform public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','ff010000-0000-0000-0000-000000000005','violation_type','delay','penalty_type','fine','details','تفاصيل كافية هنا','log_date', current_date)); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_FINE_AMOUNT_REQUIRED', 'fine needs amount: ' || sqlerrm; end;
  d := public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','ff010000-0000-0000-0000-000000000005','violation_type','delay','penalty_type','fine','amount', 15000,'details','تأخر عن الانطلاق الصباحي','log_date', current_date));
  did := (d ->> 'id')::uuid;
  assert d ->> 'penalty_type' = 'fine' and (d ->> 'amount')::numeric = 15000 and d ->> 'department_name' = 'سوّاق الكراج', 'saved: ' || d::text;
  assert jsonb_array_length(public.disclosures_list('active')) = 1, 'garage sees its draft';
  assert (public.disclosure_stats(current_date) ->> 'total')::int = 1, 'stats scoped';
  d := public.disclosure_submit(did);
  assert d ->> 'status' = 'pending', 'submitted: ' || (d ->> 'status');
  raise notice 'G2 ✅ الكراج: بحث ضمن القسم، آليات ممنوعة، خارج القسم ممنوع، غرامة مالية بمبلغ، رفع';
end $$;

-- ③ غرفة العمليات ترى الكشف نفسه (بلا تقييد)؛ كشف غرفة العمليات على موظف خارج الكراج لا يظهر للكراج
select auth.set_test_user('ee010000-0000-0000-0000-000000000002');
do $$ declare d jsonb; begin
  assert exists (select 1 from jsonb_array_elements(public.disclosures_list('pending')) x where x ->> 'employee_number' = 'G-DRV'), 'ops sees garage disclosure';
  d := public.disclosure_save(null, jsonb_build_object('target_kind','employee','employee_id','ff010000-0000-0000-0000-000000000006','violation_type','delay','details','تفاصيل كافية هنا','log_date', current_date));
  assert d ->> 'status' = 'draft', 'ops draft';
  raise notice 'G3 ✅ غرفة العمليات بلا تقييد';
end $$;
select auth.set_test_user('ee010000-0000-0000-0000-000000000003');
do $$ begin
  assert not exists (select 1 from jsonb_array_elements(public.disclosures_list('all')) x where x ->> 'employee_number' = 'G-OTH'), 'garage cannot see ops disclosure on outsider';
end $$;
set role authenticated;
do $$ begin
  assert (select count(*) from public.disclosures where employee_number = 'G-OTH') = 0, 'RLS hides outsider rows from garage';
  assert (select count(*) from public.disclosures where employee_number = 'G-DRV') = 1, 'RLS shows own-scope rows to garage';
  raise notice 'G4 ✅ عزل النطاق في القائمة وسياسة الصفوف';
end $$;
reset role;

-- ④ المعاون يعيد الكشف ⇒ التبليغ لمُعدّه برابط الكراج
select auth.set_test_user('ee010000-0000-0000-0000-000000000007');
do $$ declare did uuid; d jsonb; begin
  select id into did from public.disclosures where employee_number = 'G-DRV' and status = 'pending';
  d := public.disclosure_decide(did, false, 'يرجى إرفاق التوقيت الدقيق');
  assert d ->> 'status' = 'returned', 'returned';
  assert exists (select 1 from public.notifications n where n.user_id = 'ee010000-0000-0000-0000-000000000003' and n.link like '/central-garage/disclosures?tab=returned%'), 'garage link in notification';
  raise notice 'G5 ✅ تبليغ المُعدّ برابط بوابة الكراج';
end $$;

-- ⑤ التطوير المركزية: حفظ نوع بعقوبة fine مقبول، وعقوبة مجهولة مرفوضة
select auth.set_test_user('ee010000-0000-0000-0000-000000000001');
do $$ begin
  perform public.disclosure_type_save('garage_test', 'نوع اختبار الكراج', null, array['warning','fine'], 10000, true, 200, null, null);
  assert (select 'fine' = any(allowed_penalties) from public.disclosure_types where key = 'garage_test'), 'fine saved';
  begin perform public.disclosure_type_save('garage_test2', 'نوع آخر', null, array['jail'], null, true, 201, null, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'DISCLOSURE_PENALTY_INVALID', 'unknown penalty: ' || sqlerrm; end;
  raise notice 'G6 ✅ عقوبة «غرامة مالية» في أنواع الكشوفات';
end $$;

-- ⑥ (00207) الموظفون: الكراج يرى موظفي قسمه وفروعه فقط، بلا حقول حساسة؛ غرفة العمليات ترى الكل
select auth.set_test_user('ee010000-0000-0000-0000-000000000003');
do $$ declare j jsonb; r jsonb; begin
  j := public.garage_employees(null, current_date);
  assert (j ->> 'scoped')::boolean and j ->> 'department' = 'الكراج المركزي – الكرادة', 'scoped: ' || j::text;
  assert (j -> 'summary' ->> 'total')::int = 2, 'two in scope: ' || (j -> 'summary')::text;
  assert exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'G-DRV' and x ->> 'department' = 'سوّاق الكراج'), 'sub-dept included';
  assert not exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'G-OTH'), 'outsider excluded';
  r := (select x from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'G-DRV');
  assert (r ->> 'open_disclosures')::int = 1, 'returned disclosure counted as open: ' || r::text;
  assert not (r ? 'biometric_pin') and not (r ? 'salary') and not (r ? 'national_id_number') and not (r ? 'base_salary'), 'no sensitive fields: ' || r::text;
  assert jsonb_array_length(public.garage_employees('G-DRV', null) -> 'rows') = 1, 'search by number';
  raise notice 'G7 ✅ موظفو الكراج ضمن القسم بلا حقول حساسة';
end $$;
select auth.set_test_user('ee010000-0000-0000-0000-000000000002');
do $$ declare j jsonb; begin
  j := public.garage_employees(null, null);
  assert not (j ->> 'scoped')::boolean and exists (select 1 from jsonb_array_elements(j -> 'rows') x where x ->> 'employee_number' = 'G-OTH'), 'ops unscoped';
  raise notice 'G8 ✅ غرفة العمليات بلا تقييد';
end $$;
select auth.set_test_user('ee010000-0000-0000-0000-000000000005');
do $$ begin
  begin perform public.garage_employees(null, null); raise exception 'should fail';
  exception when others then assert sqlerrm = 'GARAGE_FORBIDDEN', 'employee forbidden: ' || sqlerrm; end;
  raise notice 'G9 ✅ الموظف العادي ممنوع';
end $$;
