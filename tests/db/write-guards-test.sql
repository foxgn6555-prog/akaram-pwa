-- اختبار 00291 (00349-A): حارس التكرار والتزامن على دوال الكتابة الحساسة — مستقل (بادئة wg).
-- (التزامن الفعلي بجلستين في scripts/db-concurrency-test.mjs — هنا: التغطية، التكرار المتتابع، إعادة المحاولة بعد الفشل، اختلاف المعاملات، تعطيل النافذة)
set client_min_messages = notice;
select set_config('app.dedup_window_seconds', '8', false);

-- ① التغطية: كل دالة في القائمة مغلّفة فعلاً، وأصلها في app غير مكشوف في public
do $$ declare bad text; n int; begin
  select string_agg(fn, ', ') into bad from app.write_guard_audit() where not guarded;
  assert bad is null, 'unguarded: ' || coalesce(bad, '');
  select count(*) into n from app.write_guard_audit(); assert n >= 60, 'list size ' || n;
  assert not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname like '%\_\_raw'), 'raw functions must not be public';
  assert exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'app' and p.proname = 'hire_request_create__raw'), 'raw moved to app';
  raise notice 'WG1 ✅ التغطية';
end $$;

-- ② بيانات: طالب تعيين + مدير مفوض
insert into auth.users (id, email) values ('49000000-0000-0000-0000-000000000001', 'wg-garage@t.iq'), ('49000000-0000-0000-0000-000000000002', 'wg-garage2@t.iq'), ('49000000-0000-0000-0000-000000000004', 'wg-ceo@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('49000000-0000-0000-0000-000000000001', 'central_garage_officer'), ('49000000-0000-0000-0000-000000000002', 'central_garage_officer'), ('49000000-0000-0000-0000-000000000004', 'super_admin') on conflict do nothing;
insert into public.departments (id, name, code) values ('49d00000-0000-0000-0000-0000000000a1', 'الكراج 49', 'WG49') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('49d00000-0000-0000-0000-0000000000a2', 'سائق 49', 'WG49J', '49d00000-0000-0000-0000-0000000000a1', true) on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id) values ('49e00000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'WG49-G', 'مسؤول الكراج 49', '2024-01-01', '49d00000-0000-0000-0000-0000000000a1'),
  ('49e00000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000002', 'WG49-G2', 'مسؤول الكراج 49 ب', '2024-01-01', '49d00000-0000-0000-0000-0000000000a1') on conflict (employee_number) do nothing;

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ③ الاستدعاء نفسه مرتين ⇒ الثاني DUPLICATE_SUBMIT وسجل واحد؛ معاملات مختلفة تمرّ؛ السلوك الأصلي محفوظ (HIRE_ALREADY_PENDING لاسم مكرر بمسار آخر)
select auth.set_test_user('49000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; n int; begin
  j := public.hire_request_create('{"full_name":"حارس أول","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb);
  assert j ->> 'status' = 'pending', 'first ok';
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"حارس أول","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'DUPLICATE_SUBMIT');
  select count(*) into n from public.hire_requests where full_name = 'حارس أول'; assert n = 1, 'exactly one request';
  j := public.hire_request_create('{"full_name":"حارس ثانٍ","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb);
  assert j ->> 'status' = 'pending', 'different args pass';
  -- ترتيب مفاتيح مختلف بالمعاملات نفسها = الاستدعاء نفسه (jsonb يطبّع الترتيب)
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"job_title_id":"49d00000-0000-0000-0000-0000000000a2","full_name":"حارس ثانٍ"}'::jsonb) $q$, 'DUPLICATE_SUBMIT');
  raise notice 'WG2 ✅ التكرار المتتابع';
end $$;

-- ④ فشل الدالة لا يُسجَّل كاستدعاء ⇒ إعادة المحاولة بعد تصحيح الخطأ مسموحة (الفشل يُلغي السجل بالتراجع)
do $$ declare j jsonb; begin
  -- الاستدعاء بالخطأ (مسمى غير موجود) يفشل بسبب الدالة الأصلية لا الحارس
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"حارس ثالث","job_title_id":"49d00000-0000-0000-0000-0000000000ff"}'::jsonb) $q$, 'HR_JOB_TITLE_INVALID');
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"حارس ثالث","job_title_id":"49d00000-0000-0000-0000-0000000000ff"}'::jsonb) $q$, 'HR_JOB_TITLE_INVALID');
  j := public.hire_request_create('{"full_name":"حارس ثالث","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb);
  assert j ->> 'status' = 'pending', 'retry with corrected args ok';
  raise notice 'WG3 ✅ إعادة المحاولة بعد الفشل';
end $$;

-- ⑤ قرار مزدوج على السجل نفسه: الثاني يحصل على رسالة الحالة من الدالة الأصلية (لا قرار ثانٍ)
select auth.set_test_user('49000000-0000-0000-0000-000000000004');
do $$ declare rid uuid; n int; begin
  select id into rid from public.hire_requests where full_name = 'حارس أول';
  perform public.approval_decide_request('hire', rid, true, null);
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'hire', rid), 'DUPLICATE_SUBMIT');
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, false, %L)', 'hire', rid, 'سبب'), 'PROCEDURE_NOT_PENDING');
  select count(*) into n from public.approval_tasks where request_kind = 'hire' and request_id = rid and status = 'approved'; assert n = 1, 'one decision';
  raise notice 'WG4 ✅ القرار المزدوج';
end $$;

-- ⑥ مستخدم آخر بالمعاملات نفسها ليس تكراراً (بصمة الاستدعاء تشمل المستخدم) فيصل إلى منطق الدالة؛ وتعطيل النافذة (0) يوقف الحارس
select auth.set_test_user('49000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; begin
  -- المعاملات نفسها التي أرسلها المستخدم الأول («حارس ثالث») — مستخدم مختلف ⇒ ليس DUPLICATE_SUBMIT بل منطق الدالة (اسم معلّق بالمسمى نفسه)
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"حارس ثالث","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'HIRE_ALREADY_PENDING');
  j := public.hire_request_create('{"full_name":"حارس رابع","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb);
  perform set_config('app.dedup_window_seconds', '0', true);
  perform pg_temp.expect_error($q$ select public.hire_request_create('{"full_name":"حارس رابع","job_title_id":"49d00000-0000-0000-0000-0000000000a2"}'::jsonb) $q$, 'HIRE_ALREADY_PENDING');
  raise notice 'WG5 ✅ المستخدم والنافذة';
end $$;
select set_config('app.dedup_window_seconds', '0', false);
