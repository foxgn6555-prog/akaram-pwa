-- اختبار 00289 (00348): طلب تعيين موظف جديد من وحدات الإجراءات — بلا رقم وظيفي، بلا موظف قبل الموافقة، سلسلة IT، الافتراضي المدير المفوض، رفض/إلغاء/موافقة، إشعارات. مستقل (بادئة hr48).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('48000000-0000-0000-0000-000000000001', 'hr48-garage@t.iq'), ('48000000-0000-0000-0000-000000000002', 'hr48-station@t.iq'), ('48000000-0000-0000-0000-000000000003', 'hr48-maint@t.iq'),
  ('48000000-0000-0000-0000-000000000004', 'hr48-ceo@t.iq'), ('48000000-0000-0000-0000-000000000005', 'hr48-dep@t.iq'), ('48000000-0000-0000-0000-000000000006', 'hr48-hr@t.iq'),
  ('48000000-0000-0000-0000-000000000007', 'hr48-it@t.iq'), ('48000000-0000-0000-0000-000000000008', 'hr48-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('48000000-0000-0000-0000-000000000001', 'central_garage_officer'), ('48000000-0000-0000-0000-000000000002', 'transfer_station'), ('48000000-0000-0000-0000-000000000003', 'maintenance'),
  ('48000000-0000-0000-0000-000000000004', 'super_admin'), ('48000000-0000-0000-0000-000000000005', 'deputy_director'), ('48000000-0000-0000-0000-000000000006', 'hr_officer'),
  ('48000000-0000-0000-0000-000000000007', 'it_admin'), ('48000000-0000-0000-0000-000000000008', 'employee')
on conflict do nothing;
-- الهيكل: قسم الكراج (مسمى سائق) · قسم المحطة (مسمى وزّان) · قسم الصيانة (مسمى فني) · قسم بعيد (مسمى كاتب)
insert into public.departments (id, name, code) values
  ('48d00000-0000-0000-0000-0000000000a1', 'الكراج المركزي 48', 'H48G'), ('48d00000-0000-0000-0000-0000000000b1', 'المحطة التحويلية 48', 'H48S'),
  ('48d00000-0000-0000-0000-0000000000c1', 'الصيانة 48', 'H48M'), ('48d00000-0000-0000-0000-0000000000d1', 'قسم بعيد 48', 'H48F') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title, drives_vehicles) values
  ('48d00000-0000-0000-0000-0000000000a2', 'سائق 48', 'H48GJ', '48d00000-0000-0000-0000-0000000000a1', true, true),
  ('48d00000-0000-0000-0000-0000000000b2', 'وزّان 48', 'H48SJ', '48d00000-0000-0000-0000-0000000000b1', true, false),
  ('48d00000-0000-0000-0000-0000000000c2', 'فني 48', 'H48MJ', '48d00000-0000-0000-0000-0000000000c1', true, false),
  ('48d00000-0000-0000-0000-0000000000d2', 'كاتب 48', 'H48FJ', '48d00000-0000-0000-0000-0000000000d1', true, false) on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id) values
  ('48e00000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'H48-G', 'مسؤول الكراج 48', '2024-01-01', '48d00000-0000-0000-0000-0000000000a1'),
  ('48e00000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000002', 'H48-S', 'مسؤول المحطة 48', '2024-01-01', '48d00000-0000-0000-0000-0000000000b1'),
  ('48e00000-0000-0000-0000-000000000003', '48000000-0000-0000-0000-000000000003', 'H48-M', 'مسؤول الصيانة 48', '2024-01-01', '48d00000-0000-0000-0000-0000000000c1')
on conflict (employee_number) do nothing;

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ① التعيين المباشر معطَّل لكل الأدوار (حتى المدير المفوض)
select auth.set_test_user('48000000-0000-0000-0000-000000000001');
do $$ begin
  perform pg_temp.expect_error($q$ select public.garage_employee_hire('{"full_name":"x","employee_number":"G-1"}'::jsonb) $q$, 'HIRE_DIRECT_DISABLED');
end $$;
select auth.set_test_user('48000000-0000-0000-0000-000000000004');
do $$ begin
  perform pg_temp.expect_error($q$ select public.garage_employee_hire('{"full_name":"x","employee_number":"G-1"}'::jsonb) $q$, 'HIRE_DIRECT_DISABLED');
  raise notice 'H1 ✅ التعيين المباشر معطَّل';
end $$;

-- ② الخيارات بلا اقتراح رقم؛ الطلب يرفض الرقم الوظيفي والحقول الحساسة وخارج النطاق؛ لا موظف يُنشأ
select auth.set_test_user('48000000-0000-0000-0000-000000000001');
do $$ declare o jsonb; j jsonb; rid uuid; n int; emp_before int; begin
  o := public.garage_hire_options();
  assert not (o ? 'next_employee_number'), 'no number suggestion: ' || o::text;
  assert exists (select 1 from jsonb_array_elements(o -> 'job_titles') t where t ->> 'name' = 'سائق 48'), 'in-scope title';
  assert not exists (select 1 from jsonb_array_elements(o -> 'job_titles') t where t ->> 'name' = 'كاتب 48'), 'out-of-scope hidden';
  assert o -> 'chain' is null or o -> 'chain' = 'null'::jsonb, 'no chain yet: ' || o::text;
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"أحمد علي","employee_number":"G-0001","job_title_id":"48d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'HIRE_NUMBER_NOT_ALLOWED');
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"أحمد علي","biometric_pin":"7","job_title_id":"48d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'GARAGE_SENSITIVE_FIELD_FORBIDDEN');
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"أح","job_title_id":"48d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'HR_NAME_REQUIRED');
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"أحمد علي","job_title_id":"48d00000-0000-0000-0000-0000000000d2"}'::jsonb) $q$, 'GARAGE_JOB_TITLE_OUT_OF_SCOPE');
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"أحمد علي","job_title_id":"48d00000-0000-0000-0000-0000000000a2","contract_type":"weekly"}'::jsonb) $q$, 'HR_CONTRACT_TYPE_INVALID');
  select count(*) into emp_before from public.employees;
  -- بلا سلسلة ⇒ المدير المفوض افتراضياً
  j := public.hire_request_create('{"full_name":"أحمد علي","phone":"07701234567","job_title_id":"48d00000-0000-0000-0000-0000000000a2","hire_date":"2026-11-01","contract_type":"daily"}'::jsonb);
  rid := (j ->> 'id')::uuid;
  assert j ->> 'status' = 'pending' and j ->> 'job_title' = 'سائق 48' and j ->> 'department' = 'الكراج المركزي 48' and not (j ->> 'via_chain')::boolean, 'created: ' || j::text;
  select count(*) into n from public.employees; assert n = emp_before, 'لا موظف يُنشأ عند الطلب';
  select count(*) into n from public.approval_tasks where request_kind = 'hire' and request_id = rid and status = 'pending' and '48000000-0000-0000-0000-000000000004' = any(approvers); assert n = 1, 'default step = super_admin';
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000004' and title like 'طلب تعيين موظف بانتظار موافقتك%أحمد علي%' and link = '/admin/approvals'; assert n = 1, 'ceo notified';
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"أحمد علي","job_title_id":"48d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'HIRE_ALREADY_PENDING');
  -- طلباتي
  select count(*) into n from public.hire_requests_mine() m where m.id = rid and m.status = 'pending' and m.current_step like 'المدير المفوض%' and m.job_title = 'سائق 48'; assert n = 1, 'mine';
  raise notice 'H2 ✅ الطلب بلا رقم وبلا موظف، الافتراضي المدير المفوض';
end $$;

-- ③ الموظف العادي ممنوع؛ الطالب لا يرى طلبات غيره؛ الموافق غير المخوّل ممنوع
select auth.set_test_user('48000000-0000-0000-0000-000000000008');
do $$ begin
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"فلان الفلاني","job_title_id":"48d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'GARAGE_FORBIDDEN');
  assert (select count(*) from public.hire_requests_mine()) = 0, 'employee sees nothing';
end $$;
select auth.set_test_user('48000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.hire_requests_mine()) = 0, 'station does not see garage requests';
end $$;
select auth.set_test_user('48000000-0000-0000-0000-000000000005');
do $$ declare rid uuid; begin
  select id into rid from public.hire_requests where full_name = 'أحمد علي';
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'hire', rid), 'HR_FORBIDDEN');
  raise notice 'H3 ✅ الصلاحيات';
end $$;

-- ④ مهام المدير المفوض + الرفض بسبب ⇒ rejected وإشعار الطالب، ولا موظف
select auth.set_test_user('48000000-0000-0000-0000-000000000004');
do $$ declare rid uuid; r record; n int; begin
  select id into rid from public.hire_requests where full_name = 'أحمد علي';
  select * into r from public.approval_my_tasks() where request_kind = 'hire';
  assert r.request_id = rid and r.type_name = 'تعيين موظف' and r.details ->> 'full_name' = 'أحمد علي' and r.details ->> 'job_title' = 'سائق 48' and r.details ->> 'source_label' = 'الكراج المركزي'
     and r.details ->> 'contract_label' = 'يومي' and r.requester_role = 'central_garage_officer' and r.start_date = '2026-11-01', 'task: ' || r::text;
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, false, null)', 'hire', rid), 'HR_REASON_REQUIRED');
  perform public.approval_decide_request('hire', rid, false, 'لا شاغر حالياً');
  select * into r from public.hire_requests where id = rid;
  assert r.status = 'rejected' and r.rejected_note = 'لا شاغر حالياً' and r.decided_by = '48000000-0000-0000-0000-000000000004', 'rejected: ' || r.status;
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000001' and title = 'رُفض طلب تعيين أحمد علي' and link = '/central-garage/procedures'; assert n = 1, 'requester notified of rejection';
  select count(*) into n from public.employees where full_name = 'أحمد علي'; assert n = 0, 'no employee after rejection';
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'hire', rid), 'PROCEDURE_NOT_PENDING');
  raise notice 'H4 ✅ الرفض';
end $$;

-- ⑤ سلسلة من IT: المحطة ← المعاون ثم المدير المفوض؛ النوع مرفوض لدور غير طالب
select auth.set_test_user('48000000-0000-0000-0000-000000000007');
do $$ declare cid uuid; begin
  perform pg_temp.expect_error($q$ select public.approval_chain_save('admin_ops', 'hire', '[{"kind":"hierarchy","role":"deputy_director"}]') $q$, 'APPROVAL_ROLE_INVALID');
  cid := public.approval_chain_save('transfer_station', 'hire', '[{"kind":"hierarchy","role":"deputy_director"},{"kind":"hierarchy","role":"super_admin"}]');
  assert cid is not null, 'chain saved';
end $$;
select auth.set_test_user('48000000-0000-0000-0000-000000000002');
do $$ declare o jsonb; j jsonb; rid uuid; n int; r record; begin
  o := public.garage_hire_options();
  assert (o -> 'chain' ->> 'steps')::int = 2, 'chain preview: ' || o::text;
  j := public.hire_request_create('{"full_name":"كريم حسن","job_title_id":"48d00000-0000-0000-0000-0000000000b2","hire_date":"2026-11-05"}'::jsonb);
  rid := (j ->> 'id')::uuid;
  assert (j ->> 'via_chain')::boolean and j ->> 'contract_type' = 'monthly', 'via chain: ' || j::text;
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000005' and title like 'طلب تعيين موظف بانتظار موافقتك (خطوة 1)%كريم حسن%' and link = '/deputy/approvals'; assert n = 1, 'deputy notified step 1';
  select count(*) into n from public.hire_requests_mine() m where m.id = rid and m.current_step like '%معاون%'; assert n = 1, 'current step deputy: ' || (select string_agg(coalesce(m.current_step, 'null'), ',') from public.hire_requests_mine() m);
  -- إلغاء من الطالب ثم طلب جديد
  perform public.hire_request_cancel(rid);
  select status into r from public.hire_requests where id = rid; assert r.status = 'cancelled', 'cancelled';
  select count(*) into n from public.approval_tasks where request_kind = 'hire' and request_id = rid and status in ('pending','waiting'); assert n = 0, 'tasks skipped on cancel';
  j := public.hire_request_create('{"full_name":"كريم حسن","job_title_id":"48d00000-0000-0000-0000-0000000000b2","hire_date":"2026-11-05"}'::jsonb);
  raise notice 'H5 ✅ السلسلة المضبوطة والإلغاء';
end $$;

-- ⑥ الموافقة خطوة بخطوة ⇒ approved + إشعار HR برابط الإكمال + إشعار الطالب؛ ولا موظف بعد
select auth.set_test_user('48000000-0000-0000-0000-000000000005');
do $$ declare rid uuid; r record; n int; begin
  select id into rid from public.hire_requests where full_name = 'كريم حسن' and status = 'pending';
  perform public.approval_decide_request('hire', rid, true, 'موافق');
  select status into r from public.hire_requests where id = rid; assert r.status = 'pending', 'still pending after step 1';
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000004' and title like 'طلب تعيين موظف بانتظار موافقتك (خطوة 2)%كريم حسن%'; assert n = 1, 'ceo notified step 2';
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'hire', rid), 'HR_FORBIDDEN');
end $$;
select auth.set_test_user('48000000-0000-0000-0000-000000000004');
do $$ declare rid uuid; r record; n int; begin
  select id into rid from public.hire_requests where full_name = 'كريم حسن' and status = 'pending';
  perform public.approval_decide_request('hire', rid, true, null);
  select * into r from public.hire_requests where id = rid;
  assert r.status = 'approved' and r.decided_at is not null and r.employee_id is null and r.completed_at is null, 'approved: ' || r.status;
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000006' and title = 'طلب تعيين معتمد — أكملوا ملف كريم حسن' and link = '/hr/hire-requests'; assert n = 1, 'hr notified';
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000002' and title = 'اعتُمد طلب تعيين كريم حسن' and link = '/transfer-station/procedures'; assert n = 1, 'requester notified';
  select count(*) into n from public.employees where full_name = 'كريم حسن'; assert n = 0, 'الموظف لا يُنشأ إلا من الموارد البشرية (الجولة التالية)';
  select count(*) into n from public.approval_timeline('hire', rid) t where t.status = 'approved'; assert n = 2, 'timeline 2 approved';
  perform pg_temp.expect_error(format('select public.hire_request_cancel(%L)', rid), 'PROCEDURE_NOT_PENDING');
  raise notice 'H6 ✅ الموافقة النهائية';
end $$;

-- ⑦ الصيانة: الطلب يمر أيضاً (المصدر maintenance) ويظهر في مهام المدير المفوض بالمصدر الصحيح
select auth.set_test_user('48000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.hire_request_create('{"full_name":"سامر فني","job_title_id":"48d00000-0000-0000-0000-0000000000c2"}'::jsonb);
  assert j ->> 'department' = 'الصيانة 48', 'maint: ' || j::text;
end $$;
select auth.set_test_user('48000000-0000-0000-0000-000000000004');
do $$ declare r record; begin
  select * into r from public.approval_my_tasks() where request_kind = 'hire' and details ->> 'full_name' = 'سامر فني';
  assert r.details ->> 'source' = 'maintenance' and r.details ->> 'source_label' = 'الصيانة' and r.requester_role = 'maintenance', 'maint task: ' || r::text;
  raise notice 'H7 ✅ الصيانة';
end $$;

-- ⑧ RLS (بدور authenticated فعلياً): HR ترى الطلبات كلها (للإكمال)، الطالب يرى طلباته فقط
set role authenticated;
select set_config('auth.user_id','48000000-0000-0000-0000-000000000006', false); select set_config('auth.role','authenticated', false);
do $$ declare n int; begin
  select count(*) into n from public.hire_requests where full_name in ('أحمد علي','كريم حسن','سامر فني'); assert n = 4, 'hr sees all: ' || n;
end $$;
select set_config('auth.user_id','48000000-0000-0000-0000-000000000003', false);
do $$ declare n int; begin
  select count(*) into n from public.hire_requests; assert n = 1, 'maint sees own only: ' || n;
  assert (select count(*) from public.hire_requests_mine()) = 1, 'mine via rpc';
  raise notice 'H8 ✅ RLS';
end $$;
reset role; select set_config('auth.user_id','', false);

-- ⑨ (00290 — الجولة B) الموارد البشرية تُكمل المعتمد: رقم يدوي، التكرار مرفوض، غير المعتمد لا يُكمَل، الموظف يُنشأ هنا فقط عبر hr_employee_create
select auth.set_test_user('48000000-0000-0000-0000-000000000006');
do $$ declare rid uuid; pid uuid; emp uuid; n int; r record; begin
  select id into rid from public.hire_requests where full_name = 'كريم حسن' and status = 'approved';
  select id into pid from public.hire_requests where full_name = 'سامر فني' and status = 'pending';
  -- القائمة: المعتمدون بانتظار الإكمال
  select count(*) into n from public.hire_requests_for_hr('approved') x where x.id = rid and x.job_title = 'وزّان 48' and x.source_label = 'المحطة التحويلية' and x.requester_name <> ''; assert n = 1, 'hr list approved';
  assert (select count(*) from public.hire_requests_for_hr('approved') x where x.id = pid) = 0, 'pending not in approved list';
  -- فحص الرقم
  assert public.hr_employee_number_available('H48-NEW-1'), 'number free';
  assert not public.hr_employee_number_available('H48-G'), 'number taken';
  assert not public.hr_employee_number_available(''), 'empty number not available';
  -- غير المعتمد لا يُكمَل؛ بلا رقم مرفوض؛ الرقم المكرر مرفوض
  perform pg_temp.expect_error(format('select public.hire_request_complete(%L, %L::jsonb)', pid, '{"employee_number":"H48-NEW-9"}'), 'HIRE_NOT_APPROVED');
  perform pg_temp.expect_error(format('select public.hire_request_complete(%L, %L::jsonb)', rid, '{}'), 'HR_NUMBER_REQUIRED');
  perform pg_temp.expect_error(format('select public.hire_request_complete(%L, %L::jsonb)', rid, '{"employee_number":"H48-G"}'), 'HR_NUMBER_TAKEN');
  assert not exists (select 1 from public.employees where full_name = 'كريم حسن'), 'still no employee after failed attempts';
  -- الإكمال الفعلي مع بيانات إضافية من HR
  emp := public.hire_request_complete(rid, '{"employee_number":"H48-NEW-1","biometric_pin":"4801","national_id_number":"123456789012","governorate":"بغداد"}'::jsonb);
  select * into r from public.employees where id = emp;
  assert r.employee_number = 'H48-NEW-1' and r.full_name = 'كريم حسن' and r.job_title_id = '48d00000-0000-0000-0000-0000000000b2' and r.department_id = '48d00000-0000-0000-0000-0000000000b1'
     and r.hire_date = '2026-11-05' and r.contract_type = 'monthly' and r.biometric_pin = '4801' and r.national_id_number = '123456789012', 'employee created from request + hr data: ' || r::text;
  assert (select status from public.employee_salary_profiles where employee_id = emp) = 'pending', 'salary pending for finance';
  assert exists (select 1 from public.finance_hr_notices where employee_id = emp and kind = 'salary_pending'), 'finance notice';
  select * into r from public.hire_requests where id = rid;
  assert r.status = 'completed' and r.employee_id = emp and r.completed_by = '48000000-0000-0000-0000-000000000006' and r.completed_at is not null, 'request completed: ' || r.status;
  select count(*) into n from public.notifications where user_id = '48000000-0000-0000-0000-000000000002' and title = 'نزل الموظف كريم حسن للنظام برقم H48-NEW-1'; assert n = 1, 'requester notified of completion';
  perform pg_temp.expect_error(format('select public.hire_request_complete(%L, %L::jsonb)', rid, '{"employee_number":"H48-NEW-2"}'), 'HIRE_ALREADY_COMPLETED');
  assert (select count(*) from public.employees where full_name = 'كريم حسن') = 1, 'exactly one employee';
  assert (select count(*) from public.hire_requests_for_hr('completed') x where x.id = rid and x.employee_number = 'H48-NEW-1') = 1, 'completed list';
  raise notice 'H9 ✅ إكمال الموارد البشرية';
end $$;
-- الطالب يرى الرقم في «طلباتي»؛ غير HR ممنوع من الإكمال والقائمة
select auth.set_test_user('48000000-0000-0000-0000-000000000002');
do $$ declare n int; begin
  select count(*) into n from public.hire_requests_mine() m where m.status = 'completed' and m.employee_number = 'H48-NEW-1'; assert n = 1, 'requester sees completed with number';
  perform pg_temp.expect_error($q$ select public.hire_requests_for_hr('approved') $q$, 'HR_FORBIDDEN');
  perform pg_temp.expect_error($q$ select public.hire_request_complete('48000000-0000-0000-0000-000000000001', '{"employee_number":"x"}'::jsonb) $q$, 'PERMISSION_DENIED');
  raise notice 'H10 ✅ صلاحيات الإكمال';
end $$;
