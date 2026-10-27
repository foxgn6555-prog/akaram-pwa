-- 00356 · الكتب الرسمية (بادئة ol): توليد تلقائي عند الإنهاء (بنوعه) وعند اعتماد التصفية، ترقيم سنوي متسلسل، ثبات الكتاب
--        (لا تعديل/حذف)، باسم المدير المفوض، عدم التكرار، القراءة للإدارات فقط، البحث والمرشّحات، الاحتفاظ والصلاحيات.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('d9000000-0000-0000-0000-000000000005', 'ol-hr@t.iq'), ('d9000000-0000-0000-0000-000000000007', 'ol-fin@t.iq'),
  ('d9000000-0000-0000-0000-000000000001', 'ol-ops@t.iq'), ('d9000000-0000-0000-0000-000000000002', 'ol-exec@t.iq'), ('d9000000-0000-0000-0000-000000000003', 'ol-dep@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('d9000000-0000-0000-0000-000000000005', 'hr_officer'), ('d9000000-0000-0000-0000-000000000007', 'finance_officer'),
  ('d9000000-0000-0000-0000-000000000001', 'ops_room'), ('d9000000-0000-0000-0000-000000000002', 'executive_director'), ('d9000000-0000-0000-0000-000000000003', 'deputy_director') on conflict do nothing;
insert into public.departments (id, name, code) values ('d9000000-0000-0000-0000-0000000000d1', 'ol الصيانة', 'OLD') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, department_id, job_title, user_id) values
  ('d9000000-0000-0000-0000-0000000000e0', 'المهندس حسين المدير المفوض', 'OL-X', '2020-01-01', 'd9000000-0000-0000-0000-0000000000d1', 'المدير المفوض', 'd9000000-0000-0000-0000-000000000002') on conflict (id) do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, department_id, job_title) values
  ('d9000000-0000-0000-0000-0000000000e1', 'ol مستقيل', 'OL-A', '2022-03-01', 'd9000000-0000-0000-0000-0000000000d1', 'فني'),
  ('d9000000-0000-0000-0000-0000000000e2', 'ol متقاعد', 'OL-B', '2010-01-01', 'd9000000-0000-0000-0000-0000000000d1', 'مشرف'),
  ('d9000000-0000-0000-0000-0000000000e3', 'ol مفصول', 'OL-C', '2024-01-01', 'd9000000-0000-0000-0000-0000000000d1', 'عامل') on conflict (id) do nothing;
select auth.set_test_user('d9000000-0000-0000-0000-000000000007');
select public.finance_salary_set('d9000000-0000-0000-0000-0000000000e1', 'monthly', 600000, 0, '{}', '{}', null);
select public.finance_salary_set('d9000000-0000-0000-0000-0000000000e2', 'monthly', 900000, 0, '{}', '{}', null);
select public.finance_salary_set('d9000000-0000-0000-0000-0000000000e3', 'monthly', 500000, 0, '{}', '{}', null);
select set_config('test.ol_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);
select set_config('test.ol_before', (select coalesce(max(letter_no), 0) from public.official_letters where letter_year = extract(year from now() at time zone 'Asia/Baghdad')::int)::text, false);

-- ═══ T1 · استقالة ⇒ كتاب «قبول استقالة» تلقائياً برقم متسلسل سنوي وباسم المدير المفوض ═══
select auth.set_test_user('d9000000-0000-0000-0000-000000000005');
select public.hr_employee_terminate('d9000000-0000-0000-0000-0000000000e1', 'resignation', (current_setting('test.ol_m')::date + 9), 'فرصة عمل أخرى');
reset role; select set_config('auth.user_id','', false);
do $$ declare l public.official_letters; y int := extract(year from now() at time zone 'Asia/Baghdad')::int; b int := current_setting('test.ol_before')::int; sid uuid; begin
  select id into sid from public.hr_settlements where employee_id = 'd9000000-0000-0000-0000-0000000000e1';
  select * into l from public.official_letters where source_kind = 'settlement' and source_id = sid and kind = 'resignation_accept';
  assert found, 'T1 letter issued';
  assert l.letter_year = y and l.letter_no = b + 1 and l.ref = (b + 1)::text || '/' || y::text, 'T1 numbering: ' || l.ref;
  assert l.kind_label = 'قبول استقالة' and l.subject like 'قبول استقالة / ol مستقيل' and l.full_name = 'ol مستقيل' and l.employee_number = 'OL-A' and l.department_name = 'ol الصيانة' and l.hire_date = '2022-03-01', 'T1 snapshot: ' || l.subject || '|' || coalesce(l.department_name,'null') || '|' || coalesce(l.job_title,'null') || '|' || l.hire_date;
  assert l.signer_title = 'المدير المفوض' and l.signer_name = 'المهندس حسين المدير المفوض', 'T1 signer: ' || coalesce(l.signer_name, 'null');
  assert jsonb_array_length(l.body) = 3 and (l.body ->> 0) like '%قبول استقالته%' and (l.body ->> 0) like '%' || (current_setting('test.ol_m')::date + 9)::text || '%', 'T1 body: ' || l.body::text;
  assert (l.body ->> 1) like '%ملف التصفية رقم ST-%', 'T1 body refers to settlement';
  assert l.payload ->> 'termination_label' = 'استقالة' and (l.payload ->> 'service_years')::numeric > 3, 'T1 payload: ' || l.payload::text;
  raise notice 'T1 ✅ كتاب قبول الاستقالة تلقائياً برقم %', l.ref;
end $$;

-- ═══ T2 · الثبات: لا تعديل ولا حذف ═══
do $$ declare ok boolean := false; begin
  begin update public.official_letters set subject = 'x' where kind = 'resignation_accept'; exception when others then ok := sqlerrm like '%LETTER_IMMUTABLE%'; end;
  assert ok, 'T2 update blocked';
  ok := false;
  begin delete from public.official_letters where kind = 'resignation_accept'; exception when others then ok := sqlerrm like '%LETTER_IMMUTABLE%'; end;
  assert ok, 'T2 delete blocked';
  raise notice 'T2 ✅ الكتب ثابتة';
end $$;

-- ═══ T3 · اعتماد التصفية ⇒ كتاب التصفية (الرقم التالي) ببنودها؛ لا يتكرر عند التسليم ═══
select auth.set_test_user('d9000000-0000-0000-0000-000000000007');
do $$ declare sid uuid := (select id from public.hr_settlements where employee_id = 'd9000000-0000-0000-0000-0000000000e1'); j jsonb; l public.official_letters; l1 public.official_letters; begin
  assert (select count(*) from public.official_letters where source_id = sid) = 1, 'T3 only termination letter before approve';
  j := public.finance_settlement_approve(sid, null);
  select * into l from public.official_letters where source_id = sid and kind = 'settlement';
  assert found, 'T3 settlement letter issued';
  select * into l1 from public.official_letters where source_id = sid and kind = 'resignation_accept';
  assert l.letter_no = l1.letter_no + 1, 'T3 sequential: ' || l.letter_no || ' after ' || l1.letter_no;
  assert (l.payload ->> 'net')::numeric = (j ->> 'net_amount')::numeric and (l.payload ->> 'leave_days')::numeric = 30 and (l.payload ->> 'leave_amount')::numeric = 600000, 'T3 payload: ' || l.payload::text;
  assert (l.body ->> 1) like '%يُصرف للموظف صافي التصفية%', 'T3 positive body';
  j := public.finance_settlement_deliver(sid, null);
  assert (select count(*) from public.official_letters where source_id = sid) = 2, 'T3 no duplicate on deliver';
  raise notice 'T3 ✅ كتاب التصفية';
end $$;

-- ═══ T4 · تقاعد ⇒ «إحالة إلى التقاعد» · فصل ⇒ «فصل من الخدمة» بالسبب · ذمة سالبة ⇒ نص الذمة ═══
reset role; select set_config('auth.user_id','', false);
insert into public.advances (id, ref_no, employee_id, employee_name, employee_number, type_id, type_name, amount, requested_amount, repayment_method, installments, status, requested_by, delivered_at, repaid_total)
select 'd9000000-0000-0000-0000-0000000000f3', 'OL-ADV-3', 'd9000000-0000-0000-0000-0000000000e3', 'ol مفصول', 'OL-C', t.id, t.name, 9000000, 9000000, 'equal', 12, 'delivered', 'd9000000-0000-0000-0000-000000000001', now() - interval '10 days', 0
from public.advance_types t where t.name = 'سلفة نقدية عادية' on conflict (id) do nothing;
select auth.set_test_user('d9000000-0000-0000-0000-000000000005');
select public.hr_employee_terminate('d9000000-0000-0000-0000-0000000000e2', 'retirement', (current_setting('test.ol_m')::date + 27), 'بلوغ السن القانونية');
select public.hr_employee_terminate('d9000000-0000-0000-0000-0000000000e3', 'dismissal', (current_setting('test.ol_m')::date + 4), 'غياب متكرر بلا عذر');
select auth.set_test_user('d9000000-0000-0000-0000-000000000007');
do $$ declare l public.official_letters; sid uuid; j jsonb; begin
  select * into l from public.official_letters where employee_id = 'd9000000-0000-0000-0000-0000000000e2' and kind = 'retirement';
  assert found and (l.body ->> 0) like '%إحالة الموظف%التقاعد%' and (l.body ->> 0) like '%الشكر والتقدير%', 'T4 retirement letter';
  select * into l from public.official_letters where employee_id = 'd9000000-0000-0000-0000-0000000000e3' and kind = 'dismissal';
  assert found and (l.body ->> 0) like '%فصل الموظف%' and (l.body ->> 0) like '%غياب متكرر بلا عذر%', 'T4 dismissal letter with reason';
  select id into sid from public.hr_settlements where employee_id = 'd9000000-0000-0000-0000-0000000000e3';
  j := public.finance_settlement_approve(sid, null);
  assert j ->> 'status' = 'debt_open', 'T4 debt';
  select * into l from public.official_letters where source_id = sid and kind = 'settlement';
  assert found and (l.body ->> 1) like '%تُسجَّل ذمة بذمته بقيمة%' and (l.payload ->> 'debt')::numeric > 0, 'T4 debt letter body: ' || (l.body ->> 1);
  raise notice 'T4 ✅ أنواع الكتب ونص الذمة';
end $$;

-- ═══ T5 · القراءة: المالية/HR/المعاون/المدير المفوض نعم؛ العمليات لا. البحث والمرشّحات. ═══
select auth.set_test_user('d9000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; lid uuid := (select id from public.official_letters where kind = 'resignation_accept' and employee_number = 'OL-A'); begin
  assert (select count(*) from public.letters_list(null, null, null, 100)) = 0, 'T5 ops sees nothing';
  begin perform public.letter_get(lid); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end;
  assert ok, 'T5 ops get forbidden';
  assert public.letters_for_source('settlement', (select source_id from public.official_letters where id = lid)) = '[]'::jsonb, 'T5 ops source empty';
end $$;
do $$ declare u uuid; n int; begin
  foreach u in array array['d9000000-0000-0000-0000-000000000007','d9000000-0000-0000-0000-000000000005','d9000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000002']::uuid[] loop
    perform auth.set_test_user(u);
    select count(*) into n from public.letters_list(null, null, 'OL-', 100);
    assert n = 5, 'T5 reader ' || u || ' sees 5, got ' || n;
  end loop;
end $$;
select auth.set_test_user('d9000000-0000-0000-0000-000000000007');
do $$ declare j jsonb; y int := extract(year from now() at time zone 'Asia/Baghdad')::int; r record; begin
  assert (select count(*) from public.letters_list('settlement', null, 'OL-', 100)) = 2, 'T5 kind filter settlement';
  assert (select count(*) from public.letters_list('termination_any', null, 'OL-', 100)) = 3, 'T5 kind filter termination_any';
  assert (select count(*) from public.letters_list(null, y, 'ol مفصول', 100)) = 2, 'T5 name search';
  assert (select count(*) from public.letters_list(null, y - 1, 'OL-', 100)) = 0, 'T5 year filter';
  select * into r from public.letters_list(null, null, 'OL-', 100) limit 1;
  assert r.kind = 'settlement' and r.employee_number = 'OL-C', 'T5 order newest first: ' || r.ref;
  j := public.letter_get(r.id);
  assert j ->> 'ref' = r.ref and j ? 'issued_date' and jsonb_array_length(j -> 'body') = 2 and (j -> 'payload' ->> 'settlement_ref') like 'ST-%', 'T5 get';
  j := public.letters_for_source('settlement', r.source_id);
  assert jsonb_array_length(j) = 2 and j -> 0 ->> 'kind' = 'dismissal' and j -> 1 ->> 'kind' = 'settlement', 'T5 for_source: ' || j::text;
  assert y = any (public.letters_years()), 'T5 years';
  raise notice 'T5 ✅ القراءة والبحث';
end $$;

-- ═══ T6 · الاحتفاظ والصلاحيات ═══
do $$ begin
  assert exists (select 1 from app.data_retention_catalog() c where c.table_name = 'official_letters' and not c.deletable), 'T6 retention (forever)';
  assert exists (select 1 from public.permission_units where key = 'finance.letters'), 'T6 permission unit';
  raise notice 'T6 ✅';
end $$;
