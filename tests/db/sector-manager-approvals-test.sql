-- اختبار 00160: مسؤول القاطع (إسناد القواطع من IT، فريقي، اللوحة، التقارير، التبليغ) + سلاسل الموافقات القابلة للتخصيص
-- (خطوات حسب التسلسل/حساب محدد، تخطّي الخطوات الفارغة، لا موافقة ذاتية، الرفض يُنهي، الموافقة الأخيرة تنفّذ الإجازة). مستقل.
set client_min_messages = notice;
-- 00258: قائمة العمال أُلغيت من بوابة المتعهد (العدد بدل القائمة)؛ هذا الاختبار يحتاج صفوف عمال/حضور أرشيفية لوحداته الأخرى إلى حين إعادة تصميمها
create or replace function pg_temp.legacy_worker(p_contractor uuid, p_name text, p_phone text default null) returns public.contractor_workers language plpgsql as $$
declare cp public.contractor_profiles; w public.contractor_workers;
begin
  select * into cp from public.contractor_profiles where user_id = p_contractor;
  insert into public.contractor_workers(contractor_user_id, full_name, phone, sector_id, parent_sector, created_by)
  values (p_contractor, p_name, p_phone, cp.sector_id, (select parent_sector from public.sectors where id = cp.sector_id), p_contractor) returning * into w;
  return w;
end $$;
create or replace function pg_temp.legacy_present(p_worker uuid) returns void language sql as $$
  insert into public.contractor_worker_attendance (worker_id, contractor_user_id, sector_id, log_date, status, marked_by)
  select w.id, w.contractor_user_id, w.sector_id, app.baghdad_today(), 'present', w.contractor_user_id from public.contractor_workers w where w.id = p_worker on conflict do nothing
$$;
insert into auth.users (id, email) values
  ('d8000000-0000-0000-0000-000000000001', 'it-d@t.iq'),
  ('d8000000-0000-0000-0000-000000000002', 'cont-d@t.iq'),       -- متعهد (الكرادة/منطقة 1)
  ('d8000000-0000-0000-0000-000000000003', 'dm-d@t.iq'),         -- مسؤول قسم (مناطق 1,2 كرادة)
  ('d8000000-0000-0000-0000-000000000004', 'sm-d@t.iq'),         -- مسؤول قاطع الكرادة
  ('d8000000-0000-0000-0000-000000000005', 'sm-z@t.iq'),         -- مسؤول قاطع الزعفرانية
  ('d8000000-0000-0000-0000-000000000006', 'deputy-d@t.iq'),     -- حساب محدد في السلسلة
  ('d8000000-0000-0000-0000-000000000007', 'hr-d@t.iq'),
  ('d8000000-0000-0000-0000-000000000008', 'dm-z@t.iq')          -- مسؤول قسم زعفرانية (منطقة 5)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d8000000-0000-0000-0000-000000000001', 'it_admin'),
  ('d8000000-0000-0000-0000-000000000002', 'employee'),
  ('d8000000-0000-0000-0000-000000000003', 'department_manager'),
  ('d8000000-0000-0000-0000-000000000004', 'admin_ops'),
  ('d8000000-0000-0000-0000-000000000005', 'admin_ops'),
  ('d8000000-0000-0000-0000-000000000006', 'deputy_director'),
  ('d8000000-0000-0000-0000-000000000007', 'hr_officer'),
  ('d8000000-0000-0000-0000-000000000008', 'department_manager')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values
  ('d8000000-0000-0000-0000-000000000003', 'morning', '{1,2}'), ('d8000000-0000-0000-0000-000000000008', 'evening', '{5}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('d8000000-0000-0000-0000-0000000000e2', 'd8000000-0000-0000-0000-000000000002', 'SM-C1', 'متعهد الكرادة', '2024-01-01', '0771', 'p2'),
  ('d8000000-0000-0000-0000-0000000000e3', 'd8000000-0000-0000-0000-000000000003', 'SM-M1', 'مسؤول قسم الكرادة', '2024-01-01', '0772', 'p3'),
  ('d8000000-0000-0000-0000-0000000000e4', 'd8000000-0000-0000-0000-000000000004', 'SM-S1', 'مسؤول قاطع الكرادة', '2024-01-01', '0773', 'p4'),
  ('d8000000-0000-0000-0000-0000000000e6', 'd8000000-0000-0000-0000-000000000006', 'SM-D1', 'معاون المدير', '2024-01-01', null, 'p6')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ S1 · إسناد القواطع لمسؤول القاطع من التطوير المركزية فقط ═══
do $$
declare it uuid := 'd8000000-0000-0000-0000-000000000001'; r record; n int;
begin
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error($q$ select * from public.sector_manager_me() $q$, 'SECTOR_MANAGER_NOT_ASSIGNED');
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{karrada}') $q$, 'IT_FORBIDDEN');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000003', '{karrada}') $q$, 'SECTOR_MANAGER_ROLE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{}') $q$, 'SECTOR_MANAGER_SECTORS_REQUIRED');
  perform pg_temp.expect_error($q$ select public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{mars}') $q$, 'PARENT_SECTOR_INVALID');   -- 00393: القطاعات من الجدول لا من قيد ثابت
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{karrada}');
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000005', '{zaafaraniya}');
  select * into r from public.sector_manager_options() o where o.parent_sector = 'karrada';
  if r.name <> 'الكرادة' or jsonb_array_length(r.sector_managers) <> 1 then raise exception 'options wrong: %', r; end if;
  -- تعدد القواطع للحساب الواحد
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{zaafaraniya,karrada}');
  select * into r from public.sector_manager_profile_for_user('d8000000-0000-0000-0000-000000000004');
  if r.parent_sectors <> '{karrada,zaafaraniya}' or r.parent_names <> '{الكرادة,الزعفرانية}' then raise exception 'profile wrong: %', r; end if;
  perform public.sector_manager_profile_save('d8000000-0000-0000-0000-000000000004', '{karrada}');
  -- إسناد متعهد لمسؤول القسم (منطقة 1)
  perform public.contractor_assign('d8000000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000003', 1::smallint);
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  select * into r from public.sector_manager_me();
  if r.parent_names <> '{الكرادة}' or r.department_managers <> 1 or r.contractors <> 1 or not r.has_employee then raise exception 'me wrong: %', r; end if;
  select count(*) into n from public.sector_manager_team();
  if n <> 1 then raise exception 'team should have 1 dept manager, got %', n; end if;
  select * into r from public.sector_manager_team();
  if r.manager_name <> 'مسؤول قسم الكرادة' or r.contractors <> 1 or jsonb_array_length(r.areas) <> 2 or r.parent_sector <> 'karrada' then raise exception 'team row wrong: %', r; end if;
  -- مسؤول الزعفرانية لا يرى مسؤول قسم الكرادة
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000005');
  select count(*) into n from public.sector_manager_team() t where t.manager_user_id = 'd8000000-0000-0000-0000-000000000003';
  if n <> 0 then raise exception 'zaafaraniya manager should not see karrada dept manager'; end if;
  raise notice 'S1 ✅ إسناد القواطع (متعددة) من IT فقط + me/team + عزل بين القواطع';
end $$;

-- ═══ S2 · سلاسل الموافقات: ضبط من IT فقط + تحقق الخطوات ═══
do $$
declare it uuid := 'd8000000-0000-0000-0000-000000000001'; r record; n int;
begin
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000007');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"}]') $q$, 'IT_FORBIDDEN');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[]') $q$, 'APPROVAL_STEPS_REQUIRED');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"media"}]') $q$, 'APPROVAL_STEP_ROLE_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"account","user_id":"00000000-0000-0000-0000-000000000000"}]') $q$, 'APPROVAL_STEP_ACCOUNT_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'bonus', '[{"kind":"hierarchy","role":"admin_ops"}]') $q$, 'APPROVAL_TYPE_INVALID');
  -- 00278: دور طالب غير حقيقي يُرفض؛ الخطوات المتكررة المتتالية تُرفض
  perform pg_temp.expect_error($q$ select public.approval_chain_save('media', 'leave', '[{"kind":"hierarchy","role":"admin_ops"}]') $q$, 'APPROVAL_ROLE_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('disclosures', 'leave', '[{"kind":"hierarchy","role":"admin_ops"}]') $q$, 'APPROVAL_ROLE_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"admin_ops"},{"kind":"hierarchy","role":"admin_ops"}]') $q$, 'APPROVAL_STEPS_DUPLICATE');
  perform public.approval_chain_save('media_officer', 'leave', '[{"kind":"hierarchy","role":"admin_ops"},{"kind":"hierarchy","role":"deputy_director"},{"kind":"hierarchy","role":"admin_ops"}]');
  select count(*) into n from public.approval_chains_list() l where l.requester_role = 'media_officer' and l.requester_label = 'مسؤول الإعلام'; assert n = 1, 'S2-278: تسمية مسؤول الإعلام';
  perform pg_temp.expect_error($q$ insert into public.approval_chains (requester_role, request_type, steps) values ('complaints', 'leave', '[]') $q$, 'approval_chains_requester_role_check');
  delete from public.approval_chains where requester_role = 'media_officer';
  -- متعهد/إجازة: مسؤول قسمه → مسؤول قاطعه → العمليات الميدانية (لا أحد بعد → تُخطّى) → معاون المدير (حساب محدد)
  perform public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"},{"kind":"hierarchy","role":"admin_ops"},{"kind":"hierarchy","role":"field_ops"},{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006"}]');
  -- مسؤول قسم/إجازة: مباشرة معاون المدير
  perform public.approval_chain_save('department_manager', 'leave', '[{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006"}]');
  select count(*) into n from public.approval_chains_list();
  if n <> 2 then raise exception 'chains list should have 2, got %', n; end if;
  select * into r from public.approval_chains_list() c where c.requester_role = 'employee';
  if r.requester_label <> 'متعهد' or jsonb_array_length(r.steps) <> 4 or (r.steps -> 3 ->> 'label') <> 'معاون المدير' or (r.steps -> 1 ->> 'label') <> 'مسؤول قاطع (حسب التسلسل)' then raise exception 'chain row wrong: %', r; end if;
  raise notice 'S2 ✅ ضبط السلاسل من IT فقط + تحقق الخطوات + تسميات';
end $$;

-- ═══ S3 · طلب متعهد يمر بالسلسلة: قسم → قاطع → (ميدانية تُخطّى) → معاون ═══
do $$
declare lid uuid; t_annual uuid; r record; n int; tl record;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  -- لا مدير مباشر في HR لكن توجد سلسلة → يُقبل الطلب
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', t_annual, current_date + 10, current_date + 11, null, null, null, null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  select count(*) into n from public.approval_tasks where request_id = lid;
  if n <> 4 then raise exception 'should create 4 tasks, got %', n; end if;
  select status into r from public.approval_tasks where request_id = lid and step_no = 3;
  if r.status <> 'skipped' then raise exception 'field_ops step should be skipped'; end if;
  select status into r from public.approval_tasks where request_id = lid and step_no = 1;
  if r.status <> 'pending' then raise exception 'step 1 should be pending'; end if;
  -- إشعار لمسؤول القسم فقط
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000003' and dedupe_key like 'approval:%';
  if n <> 1 then raise exception 'dept manager should be notified once, got %', n; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000004' and dedupe_key like 'approval:%';
  if n <> 0 then raise exception 'sector manager must not be notified yet'; end if;
  -- مسؤول القاطع لا يستطيع البتّ قبل دوره
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  select count(*) into n from public.approval_my_tasks();
  if n <> 0 then raise exception 'sector manager has no task yet'; end if;
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', true) $q$, lid), 'HR_FORBIDDEN');
  -- مسؤول القسم يوافق → الطلب يبقى معلّقاً وينتقل لمسؤول القاطع
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  select * into r from public.approval_my_tasks();
  if r.requester_name <> 'متعهد الكرادة' or r.step_no <> 1 or r.total_steps <> 3 or r.requester_role_label <> 'متعهد' then raise exception 'task wrong: %', r; end if;
  perform public.hr_leave_decide(lid, true, 'موافق');
  select status into r from public.hr_leaves where id = lid;
  if r.status <> 'pending' then raise exception 'leave must stay pending after step 1'; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000004' and dedupe_key like 'approval:%';
  if n <> 1 then raise exception 'sector manager should now be notified'; end if;
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  select * into r from public.approval_my_tasks();
  if r.step_no <> 2 or jsonb_array_length(r.previous_steps) <> 1 or (r.previous_steps -> 0 ->> 'status') <> 'approved' then raise exception 'sector task wrong: %', r; end if;
  select count(*) into n from public.hr_leaves_list('team') where id = lid and can_decide;
  if n <> 1 then raise exception 'leaves_list team should show decidable row for sector manager'; end if;
  perform public.hr_leave_decide(lid, true);
  select status into r from public.hr_leaves where id = lid;
  if r.status <> 'pending' then raise exception 'leave must stay pending before deputy'; end if;
  -- معاون المدير (حساب محدد) → الموافقة النهائية تنفّذ الإجازة
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000006');
  perform public.hr_leave_decide(lid, true, 'نهائي');
  select status, approved_by into r from public.hr_leaves where id = lid;
  if r.status <> 'approved' or r.approved_by <> 'd8000000-0000-0000-0000-000000000006' then raise exception 'leave should be approved by deputy: %', r; end if;
  select count(*) into n from public.hr_leave_ledger where leave_id = lid and kind = 'consume';
  if n <> 1 then raise exception 'balance should be consumed once'; end if;
  -- المسار مرئي للطالب
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  select count(*) into n from public.approval_timeline('leave', lid) where status = 'approved';
  if n <> 3 then raise exception 'timeline should show 3 approved steps, got %', n; end if;
  select * into tl from public.approval_timeline('leave', lid) where step_no = 3;
  if tl.status <> 'skipped' then raise exception 'timeline step 3 should be skipped'; end if;
  -- غريب لا يرى المسار
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000008');
  perform pg_temp.expect_error(format($q$ select * from public.approval_timeline('leave', '%s') $q$, lid), 'HR_FORBIDDEN');
  raise notice 'S3 ✅ السلسلة خطوة بخطوة: إشعار كل خطوة في وقتها، لا بتّ قبل الدور، تخطّي الفارغ، التنفيذ عند الأخيرة';
end $$;

-- ═══ S4 · الرفض في أي خطوة يُنهي الطلب + لا موافقة ذاتية + بلا سلسلة يبقى المدير المباشر ═══
do $$
declare lid uuid; t_annual uuid; r record; n int;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', t_annual, current_date + 20, current_date + 20, null, null, null, null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', false) $q$, lid), 'HR_REASON_REQUIRED');
  perform public.hr_leave_decide(lid, false, 'ضغط عمل');
  select status into r from public.hr_leaves where id = lid;
  if r.status <> 'rejected' then raise exception 'should be rejected'; end if;
  select count(*) into n from public.approval_tasks where request_id = lid and status = 'waiting';
  if n <> 0 then raise exception 'no waiting tasks after rejection'; end if;
  -- مسؤول القسم يطلب إجازة: سلسلته = معاون المدير مباشرة (ولا يوافق على نفسه)
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e3', t_annual, current_date + 30, current_date + 30, null, null, null, null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  select approvers into r from public.approval_tasks where request_id = lid and step_no = 1;
  if r.approvers <> array['d8000000-0000-0000-0000-000000000006']::uuid[] then raise exception 'dept manager chain wrong: %', r; end if;
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', true) $q$, lid), 'HR_FORBIDDEN');
  -- سلسلة كل خطواتها تُحلّ إلى الطالب نفسه فقط → خطأ واضح
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('deputy_director', 'leave', '[{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006"}]');
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000006');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_request('d8000000-0000-0000-0000-0000000000e6', '%s', current_date + 40, current_date + 40, null, null, null, null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)') $q$, t_annual), 'APPROVAL_NO_APPROVER');
  -- مسؤول القاطع بلا سلسلة وبلا مدير مباشر → HR_NO_MANAGER (السلوك القديم محفوظ)
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_request('d8000000-0000-0000-0000-0000000000e4', '%s', current_date + 40, current_date + 40, null, null, null, null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)') $q$, t_annual), 'HR_NO_MANAGER');
  -- تعطيل السلسلة يعيد المتعهد إلى قاعدة المدير المباشر
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"}]', false);
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$ select public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', '%s', current_date + 50, current_date + 50, null, null, null, null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)') $q$, t_annual), 'HR_NO_MANAGER');
  raise notice 'S4 ✅ الرفض يُنهي، لا موافقة ذاتية، APPROVAL_NO_APPROVER، وبلا سلسلة يبقى المدير المباشر';
end $$;

-- ═══ S5 · اللوحة والتقارير والتبليغ (بلا بيانات مالية) ═══
do $$
declare r record; j jsonb; n int; wid uuid;
begin
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000002');
  wid := (pg_temp.legacy_worker(auth.uid(), 'عامل 1')).id;
  perform pg_temp.legacy_worker(auth.uid(), 'عامل 2');
  perform public.contractor_checkin(33.31, 44.42, 8, 'c/s.jpg', 'c/t.jpg', 3);
  perform pg_temp.legacy_present(wid);
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000004');
  j := public.sector_manager_dashboard();
  if (j ->> 'department_managers')::int <> 1 or (j ->> 'contractors')::int <> 1 or (j ->> 'workers')::int <> 2 or (j ->> 'present_today')::int <> 1 or (j ->> 'presence_proved')::int <> 1 then raise exception 'dashboard wrong: %', j; end if;
  if j ? 'salary' or j ? 'wages' or j::text ilike '%wage%' or j::text ilike '%salary%' then raise exception 'dashboard must not contain finance data'; end if;
  j := public.sector_manager_reports(current_date - 6, current_date);
  if (j -> 'totals' ->> 'present')::int <> 1 or jsonb_array_length(j -> 'series') <> 7 or jsonb_array_length(j -> 'contractors') <> 1 or jsonb_array_length(j -> 'managers') <> 1 then raise exception 'reports wrong: %', j; end if;
  if (j -> 'contractors' -> 0 ->> 'name') <> 'متعهد الكرادة' or (j -> 'contractors' -> 0 ->> 'proof_days')::int <> 1 or (j -> 'managers' -> 0 ->> 'name') <> 'مسؤول قسم الكرادة' then raise exception 'report rows wrong: %', j; end if;
  if j::text ilike '%wage%' or j::text ilike '%salary%' or j::text ilike '%amount%' then raise exception 'reports must not contain finance data'; end if;
  perform pg_temp.expect_error($q$ select public.sector_manager_reports(current_date, current_date - 1) $q$, 'HR_DATE_INVALID');
  -- التبليغ: مسؤولو أقسامي فقط
  select count(*) into n from public.sector_manager_notify_targets();
  if n <> 1 then raise exception 'targets should be 1, got %', n; end if;
  perform pg_temp.expect_error($q$ select public.sector_manager_notify('x', 'y') $q$, 'NOTICE_TITLE_REQUIRED');
  perform pg_temp.expect_error($q$ select public.sector_manager_notify('اجتماع', 'غداً الساعة 9', '{d8000000-0000-0000-0000-000000000008}') $q$, 'NOTICE_TARGET_FORBIDDEN');
  n := public.sector_manager_notify('اجتماع طارئ', 'غداً الساعة 9 صباحاً في المقر');
  if n <> 1 then raise exception 'should notify 1, got %', n; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000003' and title like 'تبليغ من مسؤول القاطع:%';
  if n <> 1 then raise exception 'dept manager should receive notice'; end if;
  select count(*) into n from public.notifications where user_id = 'd8000000-0000-0000-0000-000000000008' and title like 'تبليغ من مسؤول القاطع:%';
  if n <> 0 then raise exception 'other sector dept manager must not receive notice'; end if;
  select * into r from public.sector_manager_notices();
  if r.title <> 'اجتماع طارئ' or r.recipients_count <> 1 or r.recipient_names <> 'مسؤول قسم الكرادة' then raise exception 'notices wrong: %', r; end if;
  -- مسؤول قسم لا يصل لدوال مسؤول القاطع
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.sector_manager_dashboard() $q$, 'PARENT_SECTOR_MANAGER_FORBIDDEN');
  raise notice 'S5 ✅ اللوحة والتقارير بلا بيانات مالية + التبليغ لمسؤولي أقسامه فقط';
end $$;

-- ═══ S6 · 00279: نوع فرعي + شروط + إصدارات + محاكاة ═══
do $$
declare it uuid := 'd8000000-0000-0000-0000-000000000001'; cont uuid := 'd8000000-0000-0000-0000-000000000002'; t_unpaid uuid; lid1 uuid; lid5 uuid; r record; n int; cid uuid; sim jsonb;
begin
  select id into t_unpaid from public.hr_leave_types where code = 'unpaid';
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"admin_ops"}]', true, 'nope') $q$, 'APPROVAL_SUBTYPE_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'advance', '[{"kind":"hierarchy","role":"admin_ops"}]', true, 'annual') $q$, 'APPROVAL_SUBTYPE_NOT_ALLOWED');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"admin_ops","condition":{"field":"salary","op":"gte","value":1}}]') $q$, 'APPROVAL_STEP_CONDITION_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"admin_ops","mode":"most"}]') $q$, 'APPROVAL_STEP_MODE_INVALID');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"admin_ops","sla_days":"999"}]') $q$, 'APPROVAL_STEP_SLA_INVALID');
  -- سلسلة فرعية لإجازة «بدون راتب»: مسؤول قاطعه ← المعاون (فقط إذا الأيام ≥ 3، مهلة يومان، تصعيد)
  cid := public.approval_chain_save('employee', 'leave',
    '[{"kind":"hierarchy","role":"admin_ops"},{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006","condition":{"field":"days","op":"gte","value":"3"},"sla_days":2,"escalate":"next"}]', true, 'unpaid');
  select * into r from public.approval_chains_list() l where l.id = cid;
  assert r.subtype = 'unpaid' and r.subtype_label = 'إجازة بدون راتب' and r.version_no = 1 and (r.steps -> 1 ->> 'sla_days') = '2', 'S6-1: ' || r::text;
  select count(*) into n from public.approval_chains_list() l where l.requester_role = 'employee' and l.request_type = 'leave'; assert n = 2, 'S6-2: العامة والفرعية معاً';
  -- إعادة الحفظ ⇒ إصدار ثانٍ
  perform public.approval_chain_save('employee', 'leave',
    '[{"kind":"hierarchy","role":"admin_ops"},{"kind":"account","user_id":"d8000000-0000-0000-0000-000000000006","condition":{"field":"days","op":"gte","value":"3"},"sla_days":2,"escalate":"next"}]', true, 'unpaid');
  select count(*) into n from public.approval_chain_versions_list(cid) v where v.action = 'updated'; assert n = 1, 'S6-3: إصدار updated';
  select count(*) into n from public.approval_chain_versions_list(cid); assert n = 2, 'S6-4: إصداران';
  -- محاكاة
  sim := public.approval_simulate(cont, 'leave', 'unpaid', '{"days": 1}');
  assert (sim ->> 'chain_id')::uuid = cid and (sim -> 'steps' -> 1 ->> 'status') = 'skipped_condition' and (sim -> 'steps' -> 0 ->> 'status') = 'active', 'S6-5: ' || sim::text;
  sim := public.approval_simulate(cont, 'leave', 'unpaid', '{"days": 5}');
  assert (sim -> 'steps' -> 1 ->> 'status') = 'active' and (sim -> 'steps' -> 1 -> 'approvers' -> 0 ->> 'user_id') = 'd8000000-0000-0000-0000-000000000006', 'S6-6: ' || sim::text;
  sim := public.approval_simulate(cont, 'leave', 'sick', '{}');
  assert (sim ->> 'chain_id') is null and jsonb_array_length(sim -> 'steps') = 0, 'S6-7: المرضية لا تأخذ الفرعية (العامة معطّلة في S4 ⇒ الافتراضي): ' || sim::text;
  -- طلب يوم واحد بدون راتب ⇒ السلسلة الفرعية، الخطوة الشرطية تُخطّى
  perform pg_temp.as_user(cont);
  lid1 := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', t_unpaid, current_date + 20, current_date + 20);
  select chain_id into r from public.hr_leaves where id = lid1; assert r.chain_id = cid, 'S6-8: السلسلة الفرعية';
  select status, note into r from public.approval_tasks where request_id = lid1 and step_no = 2; assert r.status = 'skipped' and r.note like 'الشرط غير متحقق%', 'S6-9: ' || r::text;
  select status into r from public.approval_tasks where request_id = lid1 and step_no = 1; assert r.status = 'pending', 'S6-10';
  -- طلب 5 أيام ⇒ الخطوة الشرطية فعّالة
  lid5 := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e2', t_unpaid, current_date + 30, current_date + 34);
  select status, step_label, sla_days, escalate into r from public.approval_tasks where request_id = lid5 and step_no = 2;
  assert r.status = 'waiting' and r.step_label like '%إذا الأيام ≥ 3%' and r.sla_days = 2 and r.escalate = 'next', 'S6-11: ' || r::text;
  perform set_config('t.lid1', lid1::text, false); perform set_config('t.lid5', lid5::text, false); perform set_config('t.cid', cid::text, false);
  raise notice 'S6 ✅ النوع الفرعي والشروط والإصدارات والمحاكاة';
end $$;

-- ═══ S7 · 00279: التفويض + المهل والتصعيد + نمط «الجميع» ═══
do $$
declare sm uuid := 'd8000000-0000-0000-0000-000000000004'; smz uuid := 'd8000000-0000-0000-0000-000000000005'; dep uuid := 'd8000000-0000-0000-0000-000000000006';
        lid5 uuid := current_setting('t.lid5')::uuid; lid1 uuid := current_setting('t.lid1')::uuid; r record; n int; did uuid; t_permit uuid; lid uuid;
begin
  -- تفويض مسؤول قاطع الكرادة ← مسؤول قاطع الزعفرانية
  perform pg_temp.as_user(smz);
  perform pg_temp.expect_error(format($q$ select public.approval_delegation_set('%s', current_date, current_date + 3, null, '%s') $q$, smz, sm), 'APPROVAL_DELEGATION_FORBIDDEN');
  perform pg_temp.as_user(sm);
  perform pg_temp.expect_error(format($q$ select public.approval_delegation_set('%s', current_date, current_date - 1) $q$, smz), 'APPROVAL_DELEGATION_DATES_INVALID');
  perform pg_temp.expect_error(format($q$ select public.approval_delegation_set('%s', current_date, current_date + 3) $q$, sm), 'APPROVAL_DELEGATION_INVALID');
  did := public.approval_delegation_set(smz, current_date, current_date + 3, 'إجازة');
  select approvers, delegates into r from public.approval_tasks where request_id = lid5 and step_no = 1;
  assert smz = any(r.approvers) and sm = any(r.approvers) and (r.delegates ->> smz::text)::uuid = sm, 'S7-1: المفوَّض إليه أُضيف: ' || r::text;
  select count(*) into n from public.notifications where user_id = smz and dedupe_key = 'delegation:' || did::text; assert n = 1, 'S7-2: إشعار التفويض';
  perform pg_temp.as_user(smz);
  perform pg_temp.expect_error(format($q$ select public.approval_delegation_set('%s', current_date, current_date + 1) $q$, sm), 'APPROVAL_DELEGATION_CIRCULAR');
  select count(*) into n from public.approval_my_tasks() where request_id = lid5; assert n = 1, 'S7-3: المهمة تظهر للمفوَّض إليه';
  perform public.hr_leave_decide(lid5, true, null);
  select status, decided_by, decided_for, note into r from public.approval_tasks where request_id = lid5 and step_no = 1;
  assert r.status = 'approved' and r.decided_by = smz and r.decided_for = sm and r.note like 'بالتفويض عن%', 'S7-4: ' || r::text;
  select status, due_at into r from public.approval_tasks where request_id = lid5 and step_no = 2; assert r.status = 'pending' and r.due_at is not null and r.due_at > now() + interval '47 hours', 'S7-5: مهلة يومين';
  -- المهلة: تذكير عند الاستحقاق
  update public.approval_tasks set due_at = now() - interval '1 hour' where request_id = lid5 and step_no = 2;
  perform app.approval_escalate_overdue();
  select reminded_at, status into r from public.approval_tasks where request_id = lid5 and step_no = 2; assert r.reminded_at is not null and r.status = 'pending', 'S7-6: تذكير';
  select count(*) into n from public.notifications where user_id = dep and dedupe_key like 'approval-remind:%'; assert n = 1, 'S7-7: إشعار التذكير للمعاون';
  perform app.approval_escalate_overdue();
  select count(*) into n from public.notifications where user_id = dep and dedupe_key like 'approval-remind:%'; assert n = 1, 'S7-8: التذكير مرة واحدة';
  -- التصعيد بعد ضعف المهلة: لا خطوة تالية ⇒ تبقى معلّقة مع علامة التصعيد
  update public.approval_tasks set due_at = now() - interval '3 days' where request_id = lid5 and step_no = 2;
  perform app.approval_escalate_overdue();
  select escalated_at, status into r from public.approval_tasks where request_id = lid5 and step_no = 2; assert r.escalated_at is not null and r.status = 'pending', 'S7-9: متعثرة بلا تالية';
  -- تصعيد إلى الخطوة التالية: طلب اليوم الواحد (الخطوة 1 معلّقة) — نضع مهلة وتصعيداً عليها وخطوة تالية
  update public.approval_tasks set status = 'waiting', note = null where request_id = lid1 and step_no = 2;
  update public.approval_tasks set sla_days = 1, escalate = 'next', due_at = now() - interval '2 days' where request_id = lid1 and step_no = 1;
  perform app.approval_escalate_overdue();
  select status, note into r from public.approval_tasks where request_id = lid1 and step_no = 1; assert r.status = 'skipped' and r.note like 'تصعيد تلقائي%', 'S7-10: ' || r::text;
  select status into r from public.approval_tasks where request_id = lid1 and step_no = 2; assert r.status = 'pending', 'S7-11: الخطوة التالية فُعّلت';
  -- إلغاء التفويض يزيل المفوَّض إليه من المهام المفتوحة
  perform pg_temp.as_user(sm);
  perform public.approval_delegation_cancel(did);
  select count(*) into n from public.approval_tasks where status in ('waiting','pending') and smz = any(approvers) and delegates ? smz::text; assert n = 0, 'S7-12: أُزيل بعد الإلغاء';
  select count(*) into n from public.approval_delegations_list() where id = did and is_active; assert n = 0, 'S7-13';
  -- نمط «الجميع»: زمنية لمسؤول قسم ⇒ كل موظفي الموارد البشرية (اثنان)
  insert into auth.users (id, email) values ('d8000000-0000-0000-0000-000000000009', 'hr2-d@t.iq') on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values ('d8000000-0000-0000-0000-000000000009', 'hr_officer') on conflict do nothing;
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('department_manager', 'time_permit', '[{"kind":"hierarchy","role":"hr_officer","mode":"all"}]');
  select id into t_permit from public.hr_leave_types where code = 'permit_unpaid';
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000003');
  lid := public.hr_leave_request('d8000000-0000-0000-0000-0000000000e3', t_permit, current_date + 2, current_date + 2, '09:00', '10:00');
  select mode, cardinality(approvers) as c into r from public.approval_tasks where request_id = lid and step_no = 1; assert r.mode = 'all' and r.c = 2, 'S7-14: ' || r::text;
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000007');
  perform public.hr_leave_decide(lid, true, null);
  select status, note into r from public.approval_tasks where request_id = lid and step_no = 1; assert r.status = 'pending' and r.note like 'وافق 1 من 2%', 'S7-15: ' || r::text;
  select status into r from public.hr_leaves where id = lid; assert r.status = 'pending', 'S7-16: الطلب ما زال معلّقاً';
  perform pg_temp.expect_error(format($q$ select public.hr_leave_decide('%s', true) $q$, lid), 'APPROVAL_ALREADY_DECIDED');   -- الموافق نفسه لا يُحسب مرتين
  perform pg_temp.as_user('d8000000-0000-0000-0000-000000000009');
  perform public.hr_leave_decide(lid, true, null);
  select status into r from public.approval_tasks where request_id = lid and step_no = 1; assert r.status = 'approved', 'S7-17';
  select status into r from public.hr_leaves where id = lid; assert r.status = 'approved', 'S7-18: اعتُمدت بعد الجميع';
  raise notice 'S7 ✅ التفويض والمهل والتصعيد ونمط الجميع';
end $$;

-- ═══ S8 · 00280: تقرير أداء الموافقات + pending_at ═══
do $$
declare it uuid := 'd8000000-0000-0000-0000-000000000001'; sm uuid := 'd8000000-0000-0000-0000-000000000004'; smz uuid := 'd8000000-0000-0000-0000-000000000005';
        lid5 uuid := current_setting('t.lid5')::uuid; lid1 uuid := current_setting('t.lid1')::uuid; r record; rep jsonb; a jsonb;
begin
  -- pending_at يُضبط بالزناد عند التفعيل ولا يسبق قرار الخطوة السابقة
  select t2.pending_at as p2, t1.decided_at as d1, t1.pending_at as p1 into r from public.approval_tasks t1 join public.approval_tasks t2 on t2.request_id = t1.request_id and t2.step_no = 2 where t1.request_id = lid5 and t1.step_no = 1;
  assert r.p1 is not null and r.p2 is not null and r.p2 >= r.d1, 'S8-1: pending_at ' || r::text;
  select pending_at into r from public.approval_tasks where request_id = lid1 and step_no = 2; assert r.pending_at is not null, 'S8-2: التصعيد يضبط pending_at';
  -- الصلاحية والتواريخ
  perform pg_temp.as_user(sm);
  perform pg_temp.expect_error($q$ select public.approval_performance_report() $q$, 'APPROVAL_REPORT_FORBIDDEN');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.approval_performance_report(current_date, current_date - 1) $q$, 'APPROVAL_REPORT_DATES_INVALID');
  rep := public.approval_performance_report(current_date, current_date);
  assert (rep -> 'summary' ->> 'decided')::int >= 3 and (rep -> 'summary' ->> 'approved')::int >= 3 and (rep -> 'summary' ->> 'avg_hours') is not null, 'S8-3: ' || (rep -> 'summary')::text;
  assert (rep -> 'summary' ->> 'delegated')::int >= 1 and (rep -> 'summary' ->> 'escalated')::int >= 1 and (rep -> 'summary' ->> 'open_now')::int >= 2 and (rep -> 'summary' ->> 'overdue_now')::int >= 1, 'S8-4: ' || (rep -> 'summary')::text;
  select x into a from jsonb_array_elements(rep -> 'by_approver') x where (x ->> 'user_id')::uuid = smz; assert a is not null and (a ->> 'as_delegate')::int = 1 and (a ->> 'decided')::int >= 1, 'S8-5: ' || coalesce(a::text, 'null');
  assert jsonb_array_length(rep -> 'by_kind') >= 1 and (select count(*) from jsonb_array_elements(rep -> 'by_kind') x where x ->> 'kind' = 'leave' and x ->> 'label' = 'إجازة') = 1, 'S8-6: ' || (rep -> 'by_kind')::text;
  assert jsonb_array_length(rep -> 'by_step') >= 2 and jsonb_array_length(rep -> 'open_tasks') >= 2 and jsonb_array_length(rep -> 'escalations') >= 1, 'S8-7';
  assert (select count(*) from jsonb_array_elements(rep -> 'open_tasks') x where (x ->> 'overdue')::boolean and (x ->> 'hours')::numeric >= 0) >= 1, 'S8-8: المتأخرون الآن';
  -- فترة لا قرارات فيها ⇒ أصفار لا أخطاء
  rep := public.approval_performance_report('2020-01-01', '2020-01-31');
  assert (rep -> 'summary' ->> 'decided')::int = 0 and (rep -> 'summary' ->> 'avg_hours') is null and rep -> 'by_step' = '[]'::jsonb and (rep -> 'summary' ->> 'open_now')::int >= 2, 'S8-9: ' || rep::text;
  raise notice 'S8 ✅ تقرير أداء الموافقات';
end $$;

update public.hr_policy set settings = settings || '{"backdated_max_days": 365}'::jsonb where id = 1;  -- 00197: الاختبار يطلب لأشهر ماضية
